HOST := "DOCKER_HOST=ssh://hetzner1"
ENV_FILE := .env

.PHONY: up down ps build rebuild

up:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) up -d

down:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) down -v

build:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) build

rebuild:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) down -v
	@export $(HOST) && docker compose --env-file $(ENV_FILE) build
	@export $(HOST) && docker compose --env-file $(ENV_FILE) up -d

ps:
	@export $(HOST) && docker ps