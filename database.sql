CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE image (
    id                       UUID NOT NULL,
    source                   TEXT,
    extension                TEXT,
    old_hash                 TEXT,
    embedding                VECTOR(768),
    searchable               BOOLEAN DEFAULT TRUE,
    blurhash                 TEXT,
    embedding_mobileclip_s1  VECTOR(512),
    embedding_mobileclip_s0  VECTOR(512),
    embedding_mobileclip_s2  VECTOR(512),
    embedding_mobileclip_b   VECTOR(512),
    embedding_mobileclip_blt VECTOR(512),
    hash                     TEXT,
    from_old_database        BOOLEAN DEFAULT FALSE,
    deleted                  BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE image
    OWNER TO postgres;

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

CREATE TABLE analytics_event (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_event_type ON analytics_event(event_type);
CREATE INDEX idx_analytics_event_created_at ON analytics_event(created_at);

CREATE MATERIALIZED VIEW image_neighbor AS
    WITH complete_image AS (
        SELECT id, embedding_mobileclip_s0
        FROM image
    )
    SELECT
        i1.id                                                     AS id1,
        i2.id                                                     AS id2,
        i1.embedding_mobileclip_s0 <=> i2.embedding_mobileclip_s0 AS distance
    FROM
        complete_image i1
        JOIN complete_image i2 ON i1.id < i2.id
WITH NO DATA;

CREATE INDEX ON image_neighbor(distance);
CREATE INDEX ON image_neighbor(id1);
CREATE INDEX ON image_neighbor(id2);
CREATE UNIQUE INDEX ON image_neighbor(id1, id2);
