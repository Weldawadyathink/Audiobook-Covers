dev:
    APP_STAGE=local pnpm exec vite dev

build:
    pnpm exec tsc --noEmit && pnpm exec vite build

preview:
    pnpm exec vite preview

types:
    pnpm exec wrangler types

reindex-images:
    NODE_OPTIONS="--loader=./src/maintenance/cloudflare-loader.mjs" \
    pnpm tsx src/maintenance/reembedImages.ts \
    --tablesample 1 --threads 10 \
    --model voyage-multimodal-3.5

deploy:
    CLOUDFLARE_ENV=development just build && pnpm exec wrangler deploy

deploy-prod:
    CLOUDFLARE_ENV=production just build && pnpm exec wrangler deploy

db_migrate:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db audiobookcovers \
    --plan-db pgschema \
    --schema audiobookcovers_dev \
    --file database.sql

db_migrate_force:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db audiobookcovers \
    --plan-db pgschema \
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
    --db audiobookcovers \
    --plan-db pgschema \
    --schema audiobookcovers \
    --file database.sql

prod_db_migrate_force:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/runw65mioxtmapip2qthyyycni/user') \
    --db audiobookcovers \
    --plan-db pgschema \
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
