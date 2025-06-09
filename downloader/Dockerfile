FROM python:3.13-bookworm AS pythonbuilder
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN pip install poetry
RUN poetry config virtualenvs.in-project true
COPY pyproject.toml poetry.lock ./
RUN poetry install

FROM denoland/deno:debian AS denobuilder
WORKDIR /app
COPY deno.json deno.lock ./
RUN deno install --frozen=true

FROM python:3.13-slim-bookworm

COPY --from=tailscale/tailscale:latest /usr/local/bin/containerboot /usr/local/bin/containerboot
COPY --from=tailscale/tailscale:latest /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY --from=tailscale/tailscale:latest /usr/local/bin/tailscale /usr/local/bin/tailscale

ENV DENO_DIR=/deno-dir/
COPY --from=denobuilder /deno-dir /deno-dir
WORKDIR /app
COPY --from=pythonbuilder /app/.venv .venv/
COPY --from=denoland/deno:bin /deno /usr/local/bin/

COPY . .

CMD ["/app/start.sh"]
