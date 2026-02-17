dev:
    APP_STAGE=local pnpm exec vite dev | roarr pretty-print

build:
    pnpm exec vite build

preview:
    pnpm exec vite preview

types:
    pnpm exec wrangler types

reindex-images:
    pnpm exec tsx reindex_images.ts

deploy:
    CLOUDFLARE_ENV=development pnpm exec vite build && wrangler deploy

deploy-prod:
    CLOUDFLARE_ENV=production pnpm exec vite build && wrangler deploy

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
