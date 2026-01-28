BEGIN TRANSACTION;

-- Rebuild dev schema as an exact clone of prod schema.
--
-- Prod schema: audiobookcovers
-- Dev schema:  audiobookcovers_dev
--
-- This script:
-- - DROPs the dev schema (CASCADE)
-- - Recreates it
-- - Clones sequences, tables (incl constraints/indexes), data, and views/matviews
--
-- Notes:
-- - Designed for Postgres.
-- - If you have additional objects in the prod schema (functions/types), add them below.

DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
BEGIN
  -- Safety: don't allow prod/dev to be the same.
  IF prod_schema = dev_schema THEN
    RAISE EXCEPTION 'prod_schema and dev_schema must differ';
  END IF;

  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', dev_schema);
  EXECUTE format('CREATE SCHEMA %I', dev_schema);
END $$;

-- Clone sequences first so SERIAL/BIGSERIAL defaults can be re-pointed cleanly.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  seq record;
  last_value bigint;
  is_called boolean;
  cycle_sql text;
BEGIN
  FOR seq IN
    SELECT *
    FROM pg_sequences
    WHERE schemaname = prod_schema
    ORDER BY sequencename
  LOOP
    cycle_sql := CASE WHEN seq.cycle THEN 'CYCLE' ELSE 'NO CYCLE' END;

    EXECUTE format(
      'CREATE SEQUENCE %I.%I INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s',
      dev_schema,
      seq.sequencename,
      seq.increment_by,
      seq.min_value,
      seq.max_value,
      seq.start_value,
      seq.cache_size,
      cycle_sql
    );

    -- Preserve current sequence position from prod.
    EXECUTE format('SELECT last_value, is_called FROM %I.%I', prod_schema, seq.sequencename)
      INTO last_value, is_called;

    EXECUTE format(
      'SELECT setval(%L, %s, %s)',
      dev_schema || '.' || seq.sequencename,
      last_value,
      CASE WHEN is_called THEN 'true' ELSE 'false' END
    );
  END LOOP;
END $$;

-- Clone tables (structure + column defaults).
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = prod_schema
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'CREATE TABLE %I.%I (LIKE %I.%I INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STORAGE INCLUDING COMMENTS)',
      dev_schema,
      tbl.tablename,
      prod_schema,
      tbl.tablename
    );
  END LOOP;
END $$;

-- Clone constraints (PK/UNIQUE/FK/CHECK).
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  tbl record;
  con record;
  condef text;
BEGIN
  -- Ensure unqualified references resolve to dev schema when constraint defs are not schema-qualified.
  PERFORM set_config('search_path', quote_ident(dev_schema) || ', public', true);

  -- Pass 1: PK/UNIQUE/CHECK across all tables.
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = prod_schema
    ORDER BY tablename
  LOOP
    FOR con IN
      SELECT
        c.conname,
        c.contype,
        pg_get_constraintdef(c.oid, true) AS constraint_def
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = prod_schema
        AND rel.relname = tbl.tablename
        AND c.contype IN ('p', 'u', 'c')
      ORDER BY c.contype, c.conname
    LOOP
      condef := replace(con.constraint_def, prod_schema || '.', dev_schema || '.');
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
        dev_schema,
        tbl.tablename,
        con.conname,
        condef
      );
    END LOOP;
  END LOOP;

  -- Pass 2: FKs across all tables (after referenced PK/UNIQUE exist).
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = prod_schema
    ORDER BY tablename
  LOOP
    FOR con IN
      SELECT
        c.conname,
        pg_get_constraintdef(c.oid, true) AS constraint_def
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = prod_schema
        AND rel.relname = tbl.tablename
        AND c.contype = 'f'
      ORDER BY c.conname
    LOOP
      condef := replace(con.constraint_def, prod_schema || '.', dev_schema || '.');
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
        dev_schema,
        tbl.tablename,
        con.conname,
        condef
      );
    END LOOP;
  END LOOP;
END $$;

-- Clone non-constraint-backed indexes on tables.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  tbl record;
  idx record;
  idx_def text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = prod_schema
    ORDER BY tablename
  LOOP
    FOR idx IN
      SELECT
        i.indexrelid,
        pg_get_indexdef(i.indexrelid) AS indexdef
      FROM pg_index i
      JOIN pg_class rel ON rel.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = prod_schema
        AND rel.relname = tbl.tablename
        AND i.indexrelid NOT IN (
          SELECT conindid
          FROM pg_constraint c
          JOIN pg_class r2 ON r2.oid = c.conrelid
          JOIN pg_namespace n2 ON n2.oid = r2.relnamespace
          WHERE n2.nspname = prod_schema
            AND r2.relname = tbl.tablename
            AND c.contype IN ('p', 'u')
            AND c.conindid <> 0
        )
      ORDER BY i.indexrelid
    LOOP
      idx_def := replace(idx.indexdef, prod_schema || '.', dev_schema || '.');
      EXECUTE idx_def;
    END LOOP;
  END LOOP;
END $$;

-- Fix any column defaults copied from prod that still reference prod schema sequences.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  d record;
  new_expr text;
BEGIN
  FOR d IN
    SELECT
      n.nspname  AS schemaname,
      c.relname  AS tablename,
      a.attname  AS columnname,
      pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
    FROM pg_attrdef ad
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    JOIN pg_class c ON c.oid = ad.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = dev_schema
      AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%' || prod_schema || '.%'
  LOOP
    new_expr := replace(d.default_expr, prod_schema || '.', dev_schema || '.');
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s',
      dev_schema,
      d.tablename,
      d.columnname,
      new_expr
    );
  END LOOP;
END $$;

-- Copy table data from prod to dev, ordering inserts by FK dependencies.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  remaining text[];
  progressed boolean;
  t text;
  blocking_fk_count int;
BEGIN
  SELECT array_agg(tablename::text ORDER BY tablename)
    INTO remaining
  FROM pg_tables
  WHERE schemaname = prod_schema;

  WHILE remaining IS NOT NULL AND array_length(remaining, 1) > 0 LOOP
    progressed := false;

    FOREACH t IN ARRAY remaining LOOP
      -- If this table has an FK to another table still in "remaining", we must load that other table first.
      SELECT count(*)
        INTO blocking_fk_count
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class refrel ON refrel.oid = c.confrelid
      JOIN pg_namespace refn ON refn.oid = refrel.relnamespace
      WHERE c.contype = 'f'
        AND n.nspname = prod_schema
        AND rel.relname = t
        AND refn.nspname = prod_schema
        AND refrel.relname = ANY(remaining);

      IF blocking_fk_count = 0 THEN
        EXECUTE format('INSERT INTO %I.%I SELECT * FROM %I.%I', dev_schema, t, prod_schema, t);
        remaining := array_remove(remaining, t);
        progressed := true;
      END IF;
    END LOOP;

    IF NOT progressed THEN
      RAISE EXCEPTION
        'Could not resolve FK load order (cycle detected). Remaining tables: %',
        remaining;
    END IF;
  END LOOP;
END $$;

-- Clone (non-materialized) views.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  v record;
  view_def text;
BEGIN
  FOR v IN
    SELECT viewname, definition
    FROM pg_views
    WHERE schemaname = prod_schema
    ORDER BY viewname
  LOOP
    view_def := replace(v.definition, prod_schema || '.', dev_schema || '.');
    EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s', dev_schema, v.viewname, view_def);
  END LOOP;
END $$;

-- Clone materialized views (WITHOUT populating data) and their indexes.
DO $$
DECLARE
  prod_schema text := 'audiobookcovers';
  dev_schema  text := 'audiobookcovers_dev';
  mv record;
  idx record;
  mv_def text;
  idx_def text;
BEGIN
  FOR mv IN
    SELECT matviewname, definition
    FROM pg_matviews
    WHERE schemaname = prod_schema
    ORDER BY matviewname
  LOOP
    mv_def := replace(mv.definition, prod_schema || '.', dev_schema || '.');
    -- `pg_matviews.definition` can include trailing semicolons and/or a trailing
    -- WITH [NO] DATA clause depending on how the matview was created. Strip that
    -- so we can safely append our own "WITH NO DATA".
    mv_def := regexp_replace(mv_def, ';\s*WITH\s+NO\s+DATA\s*$', '', 'i');
    mv_def := regexp_replace(mv_def, '\s+WITH\s+NO\s+DATA\s*$', '', 'i');
    mv_def := regexp_replace(mv_def, '\s+WITH\s+DATA\s*$', '', 'i');
    mv_def := regexp_replace(mv_def, ';\s*$', '', 'g');
    EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s WITH NO DATA', dev_schema, mv.matviewname, mv_def);

    FOR idx IN
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = prod_schema
        AND tablename = mv.matviewname
      ORDER BY indexname
    LOOP
      idx_def := replace(idx.indexdef, prod_schema || '.', dev_schema || '.');
      EXECUTE idx_def;
    END LOOP;
  END LOOP;
END $$;

-- Dev grants (adjust if you want write access).
DO $$
BEGIN
  GRANT USAGE ON SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
  GRANT SELECT ON ALL TABLES IN SCHEMA audiobookcovers_dev TO audiobookcovers_dev;
  ALTER DEFAULT PRIVILEGES IN SCHEMA audiobookcovers_dev GRANT SELECT ON TABLES TO audiobookcovers_dev;
END $$;

COMMIT;