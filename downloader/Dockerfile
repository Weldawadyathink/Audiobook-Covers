FROM python:3.13 AS pythonbuilder

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN pip install poetry
RUN poetry config virtualenvs.in-project true
COPY pyproject.toml poetry.lock ./
RUN poetry install

FROM python:3.13-slim
WORKDIR /app
COPY --from=pythonbuilder /app/.venv .venv/
COPY . .
