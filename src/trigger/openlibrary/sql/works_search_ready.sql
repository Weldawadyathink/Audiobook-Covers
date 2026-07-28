-- Terminal no-op target. Anything that should run as part of the ETL must be
-- reachable from this query's `requires` list in queries.ts.
SELECT 1;
