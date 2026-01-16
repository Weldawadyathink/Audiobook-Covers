BEGIN TRANSACTION;

DROP SCHEMA IF EXISTS audiobookcovers_dev CASCADE;
CREATE SCHEMA audiobookcovers_dev;

CREATE TABLE audiobookcovers_dev.image
    (LIKE audiobookcovers.image INCLUDING ALL);

CREATE TABLE audiobookcovers_dev.web_user
    (LIKE audiobookcovers.web_user INCLUDING ALL);

CREATE TABLE audiobookcovers_dev.session
    (LIKE audiobookcovers.session INCLUDING ALL);

CREATE TABLE audiobookcovers_dev.analytics_event
    (LIKE audiobookcovers.analytics_event INCLUDING ALL);

INSERT INTO audiobookcovers_dev.image
SELECT * FROM audiobookcovers.image;

INSERT INTO audiobookcovers_dev.web_user
SELECT * FROM audiobookcovers.web_user;

INSERT INTO audiobookcovers_dev.session
SELECT * FROM audiobookcovers.session;

INSERT INTO audiobookcovers_dev.analytics_event
SELECT * FROM audiobookcovers.analytics_event;

CREATE MATERIALIZED VIEW audiobookcovers_dev.image_neighbor AS
    WITH complete_image AS (
        SELECT id, embedding_mobileclip_s0
        FROM audiobookcovers_dev.image
    )
    SELECT
        i1.id                                                     AS id1,
        i2.id                                                     AS id2,
        i1.embedding_mobileclip_s0 <=> i2.embedding_mobileclip_s0 AS distance
    FROM
        complete_image i1
        JOIN complete_image i2 ON i1.id < i2.id
WITH NO DATA;

CREATE INDEX image_neighbor_distance_idx ON audiobookcovers_dev.image_neighbor(distance);
CREATE INDEX image_neighbor_id1_idx      ON audiobookcovers_dev.image_neighbor(id1);
CREATE INDEX image_neighbor_id2_idx      ON audiobookcovers_dev.image_neighbor(id2);
CREATE UNIQUE INDEX image_neighbor_id1_id2_uidx ON audiobookcovers_dev.image_neighbor(id1, id2);

-- NOTE: This is disabled because it takes too long to rebuild the view.
-- REFRESH MATERIALIZED VIEW audiobookcovers_dev.image_neighbor;

SELECT setval(
  pg_get_serial_sequence('audiobookcovers_dev.web_user', 'id'),
  COALESCE((SELECT MAX(id) FROM audiobookcovers_dev.web_user), 1),
  true
);

SELECT setval(
  pg_get_serial_sequence('audiobookcovers_dev.analytics_event', 'id'),
  COALESCE((SELECT MAX(id) FROM audiobookcovers_dev.analytics_event), 1),
  true
);

ALTER TABLE audiobookcovers_dev.image OWNER TO postgres;
ALTER TABLE audiobookcovers_dev.web_user OWNER TO postgres;
ALTER TABLE audiobookcovers_dev.session OWNER TO postgres;
ALTER TABLE audiobookcovers_dev.analytics_event OWNER TO postgres;
ALTER MATERIALIZED VIEW audiobookcovers_dev.image_neighbor OWNER TO postgres;

COMMIT;