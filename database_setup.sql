-- One-time database setup instructions. Intended to be run manually once.


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
