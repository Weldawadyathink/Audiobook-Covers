FUNCTION_NAME = AudiobookCovers_CoverProcessor
DEPLOY_FILES := $(wildcard *)
DEPENDENCY_DIRECTORY = ./site-packages

.PHONY: clean deploy

deploy: 
	@gcloud run deploy clip-ai-lookup --source . --region us-central1 --cpu 1 --cpu-boost --memory 1Gi

clean:
	@rm -rf $(ZIP_FILE)



