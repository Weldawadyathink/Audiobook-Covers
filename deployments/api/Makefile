HOST := "DOCKER_HOST=ssh://hetzner1"
ENV_FILE := .env

.PHONY: up down ps down-v pull

up:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) up -d

down:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) down

down-v:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) down -v

pull:
	@export $(HOST) && docker compose --env-file $(ENV_FILE) pull

ps:
	@export $(HOST) && docker ps