DROP TABLE IF EXISTS search_log;
CREATE TABLE search_log (
    id INTEGER PRIMARY KEY,
    date_time TEXT,
    search_text TEXT,
    num_results INTEGER
);
