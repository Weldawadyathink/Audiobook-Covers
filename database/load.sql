CREATE TABLE image AS
SELECT id,
       source,
       "extension",
       searchable,
       blurhash,
       CAST(metaclip_b16 AS FLOAT[512])      AS metaclip_b16,
       CAST(vit_large_patch14 AS FLOAT[768]) AS vit_large_patch14,
       CAST(mobileclip_blt AS FLOAT[512])    AS mobileclip_blt,
       hash
FROM 'database/image.parquet';
