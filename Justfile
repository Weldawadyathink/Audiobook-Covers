dev:
    pnpm run dev | roarr pretty-print

db_migrate:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --schema audiobookcovers_dev \
    --file database.sql

db_migrate_force:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --schema audiobookcovers_dev \
    --file database.sql \
    --auto-approve


prod_db_migrate:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --schema audiobookcovers \
    --file database.sql

prod_db_migrate_force:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    --schema audiobookcovers \
    --file database.sql \
    --auto-approve

devdb_rebuild:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    psql \
    -h $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    -U $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    -d $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/database') \
    -f rebuild_dev_db.sql

loadtest:
    pnpm run loadtest

deploy:
    pnpm run deploy

deploy-prod:
    pnpm run deploy-prod