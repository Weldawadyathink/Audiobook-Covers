
-- Audiobookcovers user

GRANT USAGE ON SCHEMA public TO audiobookcovers;
GRANT SELECT, UPDATE, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO audiobookcovers;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers;

GRANT USAGE ON SCHEMA audiobookcovers TO audiobookcovers;
GRANT SELECT, UPDATE, INSERT, DELETE ON ALL TABLES IN SCHEMA audiobookcovers TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO audiobookcovers;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audiobookcovers TO audiobookcovers;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers;

ALTER USER audiobookcovers SET SEARCH_PATH TO audiobookcovers, public;

-- Audiobookcovers_dev user

GRANT USAGE ON SCHEMA public TO audiobookcovers_dev;
GRANT SELECT, UPDATE, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO audiobookcovers_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers_dev;

GRANT USAGE ON SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
GRANT SELECT, UPDATE, INSERT, DELETE ON ALL TABLES IN SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers_dev GRANT SELECT, UPDATE, INSERT, DELETE ON TABLES TO audiobookcovers_dev;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers_dev GRANT USAGE, SELECT ON SEQUENCES TO audiobookcovers_dev;

ALTER USER audiobookcovers_dev SET SEARCH_PATH TO audiobookcovers_dev, public;

CREATE TABLE image (
    id                 UUID NOT NULL,
    source             TEXT,
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

ALTER TABLE ONLY image
    ADD CONSTRAINT idx_image_pkey PRIMARY KEY (id);

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
