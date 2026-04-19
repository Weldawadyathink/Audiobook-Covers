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
