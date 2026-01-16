dev:
    pnpm run dev | roarr pretty-print

db_migrate:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/database') \
    --schema audiobookcovers_dev \
    --file database.sql

prod_db_migrate:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/password') \
    pgschema apply \
    --host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/host') \
    --plan-host $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/host') \
    --user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/user') \
    --plan-user $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/user') \
    --db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/database') \
    --plan-db $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/database') \
    --schema audiobookcovers \
    --file database.sql

devdb_rebuild:
    @PGPASSWORD=$(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/password') \
    psql \
    -h $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/host') \
    -U $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/user') \
    -d $(op read 'op://xdpqq36uuedlgindu4gaiwdify/g3iocgcrscj2j2yavznalhux5u/database') \
    -f rebuild_dev_db.sql

docker:
    docker build . -t audiobookcovers && docker run -it --rm audiobookcovers

docker_it:
    docker build . -t audiobookcovers && docker run -it --rm audiobookcovers /bin/sh

loadtest:
    pnpm run loadtest

deploy:
    fly deploy --config fly.toml
