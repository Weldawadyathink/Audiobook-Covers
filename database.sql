-- Audiobookcovers user

GRANT USAGE ON SCHEMA public TO audiobookcovers;
GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON TABLES TO audiobookcovers;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers;

GRANT USAGE ON SCHEMA audiobookcovers TO audiobookcovers;
GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA audiobookcovers TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON TABLES TO audiobookcovers;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audiobookcovers TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers;

ALTER USER audiobookcovers SET SEARCH_PATH TO audiobookcovers, public;

-- Audiobookcovers_dev user

GRANT USAGE ON SCHEMA public TO audiobookcovers_dev;
GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON TABLES TO audiobookcovers_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers_dev;

GRANT USAGE ON SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers_dev GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE ON TABLES TO audiobookcovers_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers_dev GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers_dev;

ALTER USER audiobookcovers_dev SET SEARCH_PATH TO audiobookcovers_dev, public;



CREATE TABLE image (
    id                 UUID NOT NULL PRIMARY KEY,
    source             TEXT,
    reddit_post_id     TEXT,
    reddit_comment_id  UUID,
    extension          TEXT,
    old_hash           TEXT,
    searchable         BOOLEAN DEFAULT TRUE,
    blurhash           TEXT,
    hash               TEXT,
    from_old_database  BOOLEAN DEFAULT FALSE,
    deleted            BOOLEAN NOT NULL DEFAULT FALSE,
    openlibrary_work_id            TEXT,
    openlibrary_work_id_confidence TEXT,
    openlibrary_work_id_model      TEXT,
    embedding_andreasjansson_clip              VECTOR(768),
    embedding_voyage_multimodal_3_5            VECTOR(1024),
    embedding_voyage_multimodal_3              VECTOR(1024),
    embedding_jina_clip_v1                     VECTOR(768),
    embedding_jina_clip_v2                     VECTOR(1024),
    embedding_jina_clip_v2_d32                 VECTOR(32),
    embedding_jina_embeddings_v4               VECTOR(2048),
    embedding_jina_embeddings_v4_d128          VECTOR(128),
    embedding_cohere_embed_v4_0_d256           VECTOR(256),
    embedding_cohere_embed_v4_0_d1536          VECTOR(1536),
    embedding_google_multimodalembedding_001   VECTOR(768)
);

CREATE INDEX idx_image_hash ON image USING btree (hash);
CREATE INDEX idx_image_searchable ON image USING btree (searchable);

CREATE TABLE web_user (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE session (
    session_id    TEXT PRIMARY KEY,
    user_id       INTEGER     NOT NULL REFERENCES web_user (id) ON DELETE CASCADE,
    expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user_id ON session (user_id);

CREATE TABLE reddit_post (
    id TEXT NOT NULL PRIMARY KEY,
    status TEXT NOT NULL,
    title TEXT,
    body TEXT,
    author TEXT,
    flair TEXT
);

CREATE INDEX idx_reddit_post_status ON reddit_post (status);

CREATE TABLE reddit_comment (
    id UUID NOT NULL PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES reddit_post (id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES reddit_comment (id) ON DELETE CASCADE,
    content TEXT
);

ALTER TABLE image ADD CONSTRAINT fk_image_reddit_post_id    FOREIGN KEY (reddit_post_id)    REFERENCES reddit_post (id)    ON DELETE SET NULL;
ALTER TABLE image ADD CONSTRAINT fk_image_reddit_comment_id FOREIGN KEY (reddit_comment_id) REFERENCES reddit_comment (id) ON DELETE SET NULL;


-- OpenLibrary ETL State

CREATE TABLE openlibrary_etl_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  status TEXT -- Will be 'not_complete', 'in_progress', 'failed', or dumpDate
);

CREATE OR REPLACE FUNCTION openlibrary_etl_state()
RETURNS TABLE (status text)
LANGUAGE sql
AS $$
    WITH upsert AS (
        INSERT INTO openlibrary_etl_state (id, status)
        VALUES (true, 'not_complete')
        ON CONFLICT (id) DO NOTHING
    )
    SELECT s.status
    FROM openlibrary_etl_state s
    WHERE id = true;
$$;

CREATE OR REPLACE FUNCTION openlibrary_etl_state(p_status text)
RETURNS TABLE (status text)
LANGUAGE sql
AS $$
    INSERT INTO openlibrary_etl_state (id, status)
    VALUES (true, p_status)
    ON CONFLICT (id)
    DO UPDATE SET
        status = EXCLUDED.status;
    SELECT s.status
    FROM openlibrary_etl_state s
    WHERE id = true;
$$;



-- OpenLibrary Work Search

CREATE TABLE openlibrary_work_search (
    olid                      TEXT NOT NULL,
    canonical_score           INTEGER NOT NULL,
    title                     TEXT NOT NULL,
    subtitle                  TEXT,
    title_aliases             TEXT[] NOT NULL DEFAULT '{}',
    author_names              TEXT[] NOT NULL DEFAULT '{}',
    author_alternate_names    TEXT[] NOT NULL DEFAULT '{}',
    first_publish_date        TEXT,
    first_edition_publish_year INTEGER,
    latest_edition_publish_year INTEGER,
    edition_count             INTEGER NOT NULL DEFAULT 0,
    subjects                  TEXT[] NOT NULL DEFAULT '{}',
    description               TEXT,
    publishers                TEXT[] NOT NULL DEFAULT '{}',
    language_ids              TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_openlibrary_work_search_olid
    ON openlibrary_work_search
    USING btree (olid);

CREATE OR REPLACE FUNCTION openlibrary_work_search_set_indexed(indexed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF indexed THEN
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_search SET LOGGED';
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_openlibrary_work_search_olid
            ON audiobookcovers.openlibrary_work_search
            USING btree (olid)
        ';
    ELSE
        EXECUTE 'DROP INDEX IF EXISTS audiobookcovers.idx_openlibrary_work_search_olid';
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_search SET UNLOGGED';
    END IF;
END
$$;

REVOKE ALL ON FUNCTION openlibrary_work_search_set_indexed(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION openlibrary_work_search_set_indexed(boolean) TO audiobookcovers;
GRANT EXECUTE ON FUNCTION openlibrary_work_search_set_indexed(boolean) TO audiobookcovers_dev;


-- OpenLibrary Work Title Search

CREATE TABLE openlibrary_work_title_search (
    olid               TEXT NOT NULL, -- Uniqueness is guaranteed within BigQuery, having this be a prmary key slows inserts
    canonical_score    INTEGER NOT NULL,
    title_search_text  TEXT NOT NULL
);

CREATE INDEX idx_openlibrary_work_title_search_tsv
    ON openlibrary_work_title_search
    USING gin (to_tsvector('simple', title_search_text));

CREATE OR REPLACE FUNCTION openlibrary_work_title_search_set_indexed(indexed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF indexed THEN
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_title_search SET LOGGED';
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_openlibrary_work_title_search_tsv
            ON audiobookcovers.openlibrary_work_title_search
            USING gin (to_tsvector(''simple'', title_search_text))
        ';
    ELSE
        EXECUTE 'DROP INDEX IF EXISTS audiobookcovers.idx_openlibrary_work_title_search_tsv';
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_title_search SET UNLOGGED';
    END IF;
END
$$;

REVOKE ALL ON FUNCTION openlibrary_work_title_search_set_indexed(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION openlibrary_work_title_search_set_indexed(boolean) TO audiobookcovers;
GRANT EXECUTE ON FUNCTION openlibrary_work_title_search_set_indexed(boolean) TO audiobookcovers_dev;


-- OpenLibrary Work Author Search

CREATE TABLE openlibrary_work_author_search (
    olid                TEXT NOT NULL, -- Uniqueness is guaranteed within BigQuery, having this be a prmary key slows inserts
    canonical_score     INTEGER NOT NULL,
    author_search_text  TEXT NOT NULL
);

CREATE INDEX idx_openlibrary_work_author_search_tsv
    ON openlibrary_work_author_search
    USING gin (to_tsvector('simple', author_search_text));

CREATE OR REPLACE FUNCTION openlibrary_work_author_search_set_indexed(indexed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF indexed THEN
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_author_search SET LOGGED';
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_openlibrary_work_author_search_tsv
            ON audiobookcovers.openlibrary_work_author_search
            USING gin (to_tsvector(''simple'', author_search_text))
        ';
    ELSE
        EXECUTE 'DROP INDEX IF EXISTS audiobookcovers.idx_openlibrary_work_author_search_tsv';
        EXECUTE 'ALTER TABLE audiobookcovers.openlibrary_work_author_search SET UNLOGGED';
    END IF;
END
$$;

REVOKE ALL ON FUNCTION openlibrary_work_author_search_set_indexed(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION openlibrary_work_author_search_set_indexed(boolean) TO audiobookcovers;
GRANT EXECUTE ON FUNCTION openlibrary_work_author_search_set_indexed(boolean) TO audiobookcovers_dev;
