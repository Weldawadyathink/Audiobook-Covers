CREATE SCHEMA pgbouncer;
ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RAISE WARNING 'PgBouncer auth request: %', p_usename;
 
    RETURN QUERY
    SELECT usename::TEXT, passwd::TEXT FROM pg_catalog.pg_shadow
     WHERE usename = p_usename;
END;
$$;

ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO postgres;

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;
