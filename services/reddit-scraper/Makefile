NAMESPACE := weldawadyathink
IMAGE_NAME := audiobookcovers-reddit-scraper
IMAGE_TAG := latest

FULL_TAG := ${NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}

.PHONY: deploy

deploy: last_update

last_update: main.py Dockerfile requirements.txt Makefile
	@set -e; \
	docker buildx build --platform linux/amd64 -t $(FULL_TAG) . --push; \
	docker push $(FULL_TAG); \
	touch last_update
