-- Legacy schema reference.
-- Drizzle schema lives in src/db/schema.ts; keep this file temporarily while
-- the generated Drizzle migrations are reviewed and baselined by a human.

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

CREATE TABLE openlibrary_work (
    olid               TEXT NOT NULL PRIMARY KEY,
    title              TEXT NOT NULL,
    subtitle           TEXT,
    author_names       TEXT[] NOT NULL DEFAULT '{}',
    author_aliases     TEXT[] NOT NULL DEFAULT '{}',
    title_aliases      TEXT[] NOT NULL DEFAULT '{}',
    first_publish_year INTEGER,
    edition_count      INTEGER,
    canonical_score    INTEGER
);

CREATE OR REPLACE FUNCTION public.immutable_array_to_string(input_array TEXT[], delimiter TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT array_to_string(input_array, delimiter);
$$;

CREATE INDEX idx_openlibrary_work_title_search
    ON openlibrary_work
    USING gin (to_tsvector('simple'::regconfig, COALESCE(title, '')));

CREATE INDEX idx_openlibrary_work_author_names_search
    ON openlibrary_work
    USING gin (to_tsvector('simple'::regconfig, immutable_array_to_string(author_names, ' ')));

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
