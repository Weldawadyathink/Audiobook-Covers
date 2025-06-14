CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE public.image (
    id                       UUID NOT NULL,
    source                   TEXT,
    extension                TEXT,
    old_hash                 TEXT,
    embedding                public.VECTOR(768),
    searchable               BOOLEAN DEFAULT TRUE,
    blurhash                 TEXT,
    embedding_mobileclip_s1  public.VECTOR(512),
    embedding_mobileclip_s0  public.VECTOR(512),
    embedding_mobileclip_s2  public.VECTOR(512),
    embedding_mobileclip_b   public.VECTOR(512),
    embedding_mobileclip_blt public.VECTOR(512),
    hash                     TEXT,
    from_old_database        BOOLEAN DEFAULT FALSE
);


ALTER TABLE public.image
    OWNER TO postgres;

ALTER TABLE ONLY public.image
    ADD CONSTRAINT idx_image_pkey PRIMARY KEY (id);
CREATE INDEX idx_image_hash ON public.image USING btree (hash);
CREATE INDEX idx_image_searchable ON public.image USING btree (searchable);

GRANT USAGE ON SCHEMA public TO audiobookcovers_readonly;
GRANT USAGE ON SCHEMA public TO audiobookcovers_readwrite;

GRANT SELECT ON TABLE public.image TO audiobookcovers_readonly;
GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public.image TO audiobookcovers_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE ON SEQUENCES TO audiobookcovers_readwrite;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO audiobookcovers_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, DELETE, UPDATE ON TABLES TO audiobookcovers_readwrite;
