dev:
    pnpm run dev | roarr pretty-print

db_args:
    #!/bin/zsh
    source ~/.zshrc
    flyway info

db_migrate:
    #!/bin/zsh
    source ~/.zshrc
    flyway migrate

production_db_args:
    #!/bin/zsh
    source ~/.zshrc
    flyway info -environment=prod

production_db_migrate:
    #!/bin/zsh
    source ~/.zshrc
    flyway migrate -environment=prod

devdb_rebuild:
    #!/bin/zsh
    source ~/.zshrc
    set -e

    psql pgbouncer -X -c "PAUSE audiobookcovers_dev;"
    psql pgbouncer -X -c "PAUSE audiobookcovers;"

    psql postgres -X -c "DROP DATABASE audiobookcovers_dev;"
    psql postgres -X -c "CREATE DATABASE audiobookcovers_dev WITH TEMPLATE audiobookcovers;"

    psql pgbouncer -X -c "RESUME audiobookcovers;"
    psql pgbouncer -X -c "RESUME audiobookcovers_dev;"

docker:
    docker build . -t audiobookcovers && docker run -it --rm audiobookcovers

docker_it:
    docker build . -t audiobookcovers && docker run -it --rm audiobookcovers /bin/sh
