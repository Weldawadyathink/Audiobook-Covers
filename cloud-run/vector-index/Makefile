FUNCTION_NAME = AudiobookCovers_CoverProcessor
DEPLOY_FILES := $(wildcard *.py) Dockerfile requirements.txt Makefile
DEPENDENCY_DIRECTORY = ./site-packages

.PHONY: deploy

deploy: last_update

last_update: $(DEPLOY_FILES)
	@touch last_update
	@gcloud run jobs deploy vector-index --source . \
		--region us-central1 --cpu 1 --memory 2Gi \
		--set-secrets=PINECONE=pinecone_db:latest \
		--set-secrets=ALGOLIA=algolia-search:latest \
		--task-timeout=60m \
		--max-retries=0 \
		--parallelism=1 \
		--update-env-vars GOOGLE_CLOUD_RUN=True \
