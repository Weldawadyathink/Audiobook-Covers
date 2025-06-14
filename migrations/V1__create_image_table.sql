CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE public.image
(
    id                       uuid NOT NULL,
    source                   text,
    extension                text,
    old_hash                 text,
    embedding                public.vector(768),
    searchable               boolean DEFAULT true,
    blurhash                 text,
    embedding_mobileclip_s1  public.vector(512),
    embedding_mobileclip_s0  public.vector(512),
    embedding_mobileclip_s2  public.vector(512),
    embedding_mobileclip_b   public.vector(512),
    embedding_mobileclip_blt public.vector(512),
    hash                     text,
    from_old_database        boolean DEFAULT false
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
