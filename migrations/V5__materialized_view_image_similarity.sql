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
    WHERE
        i1.embedding_mobileclip_s0 <=> i2.embedding_mobileclip_s0 < 0.1
WITH NO DATA;

-- To refresh the view
-- REFRESH MATERIALIZED VIEW CONCURRENTLY image_neighbor;

CREATE INDEX ON image_neighbor(distance);
CREATE INDEX ON image_neighbor(id1);
CREATE INDEX ON image_neighbor(id2);
CREATE UNIQUE INDEX ON image_neighbor(id1, id2);