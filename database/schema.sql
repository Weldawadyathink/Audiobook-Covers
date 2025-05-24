CREATE TABLE image
(
    id                VARCHAR,
    source            VARCHAR,
    "extension"       VARCHAR,
    searchable        BOOLEAN,
    blurhash          VARCHAR,
    metaclip_b16      FLOAT[512],
    vit_large_patch14 FLOAT[768],
    mobileclip_blt    FLOAT[512],
    hash              BIT
);
