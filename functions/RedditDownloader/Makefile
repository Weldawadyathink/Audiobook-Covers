ZIP_FILE := function.zip
FUNCTION_NAME := AudiobookCovers_RedditDownloader
DEPLOY_FILES := $(wildcard *.py)

.PHONY: clean deploy

deploy: $(ZIP_FILE)

clean:
	@rm -rf $(ZIP_FILE)

function.zip: Makefile $(DEPLOY_FILES)
	@echo "Packaging zip file"
	@rm -f $(ZIP_FILE)
	@zip -9 --quiet $(ZIP_FILE) $(DEPLOY_FILES)
	@# Deploy included here to only deploy of changes are made
	@echo "Deploying to AWS Lambda"
	@aws lambda update-function-code --function-name $(FUNCTION_NAME) --zip-file fileb://$(ZIP_FILE) --publish --output text > /dev/null
