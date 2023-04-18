download-reddit:
	@./venv/bin/python ./downloader/download.py

deploy: deploy-worker deploy-pages deploy-elasticsearch deploy-files

deploy-worker:
	@cd worker && wrangler publish

deploy-pages:
	@wrangler pages publish pages --project-name=audiobook-covers

deploy-elasticsearch:
	@./venv/bin/python ./deploy/to_elasticsearch.py

deploy-files:
	@./venv/bin/python ./deploy/to_s3.py

curate-overview:
	@./venv/bin/python ./downloader/curate_overview_images.py

.PHONY: download-reddit add-to-db deploy deploy-worker deploy-pages deploy-elasticsearch deploy-files curate-overview
