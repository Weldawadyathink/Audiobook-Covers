.PHONY: deploy dev

SOURCES = $(wildcard src/*)

deploy: last_update

dev:
	@npm run dev

last_update: $(SOURCES) wrangler.toml
	@echo "Deploying AudiobookCovers Updater to Cloudflare Workers"
	@npm run deploy
	@touch last_update
