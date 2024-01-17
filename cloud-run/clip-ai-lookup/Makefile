FUNCTION_NAME = AudiobookCovers_CoverProcessor
DEPLOY_FILES := $(wildcard *.py) Dockerfile requirements.txt
DEPENDENCY_DIRECTORY = ./site-packages

.PHONY: clean deploy

deploy: last_update

last_update: $(DEPLOY_FILES)
	@touch last_update
	@gcloud run deploy clip-ai-lookup --source . \
		--region us-central1 --cpu 1 --cpu-boost --memory 4Gi \
		--set-secrets=PINECONE=pinecone_db:latest \
		--update-env-vars GOOGLE_CLOUD_RUN=True \
		--concurrency 10

clean:
	@rm -rf $(ZIP_FILE)
