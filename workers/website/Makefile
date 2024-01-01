.PHONY: deploy

SOURCES = $(wildcard src/*)

deploy: last_update


last_update: $(SOURCES)
	@echo "Deploying AudiobookCovers Website to Cloudflare Pages"
	@npx wrangler pages deploy src --project-name audiobook-covers-website --branch production
	@touch last_update