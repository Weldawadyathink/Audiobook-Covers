download:
	@./venv/bin/python ./downloader/download_all.py

deploy: deploy-worker deploy-pages deploy-elasticsearch deploy-files

deploy-worker:
	@cd worker && wrangler publish

deploy-pages:
	@wrangler pages publish pages --project-name=audiobook-covers --branch=production

deploy-elasticsearch:
	@./venv/bin/python ./deploy/to_elasticsearch.py

deploy-files:
	@./venv/bin/python ./deploy/to_s3.py

curate-overview:
	@./venv/bin/python ./downloader/curate_overview_images.py

database-backup:
	@mkdir -p backup
	@sqlite3 covers.db ".backup backup/covers-`date +'%Y-%m-%d_%H-%M-%S'`.db"

.PHONY: download add-to-db deploy deploy-worker deploy-pages deploy-elasticsearch deploy-files curate-overview database-backup
