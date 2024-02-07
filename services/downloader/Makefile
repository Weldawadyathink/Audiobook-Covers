NAMESPACE := weldawadyathink
IMAGE_NAME := audiobookcovers-image-downloader
IMAGE_TAG := latest

FULL_TAG := ${NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}

SOURCE_FILES := $(wildcard *.py) requirements.txt Dockerfile .dockerignore Makefile

.PHONY: deploy

deploy: last_update

last_update: $(SOURCE_FILES)
	@set -e; \
	docker buildx build --platform linux/amd64 -t $(FULL_TAG) . --push; \
	touch last_update
