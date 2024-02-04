NAMESPACE := weldawadyathink
IMAGE_NAME := audiobookcovers-api
IMAGE_TAG := latest

FULL_TAG := ${NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}

SOURCE_FILES := $(wildcard ./src/*) package.json package-lock.json tsconfig.json

.PHONY: deploy

deploy: last_update

last_update: Dockerfile Makefile $(SOURCE_FILES)
	@set -e; \
	docker buildx build --platform linux/amd64 -t $(FULL_TAG) . --push; \
	docker push $(FULL_TAG); \
	touch last_update
