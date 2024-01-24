IMAGE_NAME := us-central1-docker.pkg.dev/ai-ocr-381723/audiobookcovers-docker/vector-index-neon
IMAGE_TAG := latest
JOB_NAME := vector-index-neon

.PHONY: deploy

deploy: last_update

last_update: main.py Dockerfile requirements.txt Makefile
	@docker buildx build --platform linux/amd64 -t $(IMAGE_NAME):$(IMAGE_TAG) . --load
	@docker push $(IMAGE_NAME):$(IMAGE_TAG)
	@gcloud run jobs deploy $(JOB_NAME) \
		--image $(IMAGE_NAME):$(IMAGE_TAG) \
		--region us-central1 --cpu 1 --memory 2Gi \
		--set-secrets=DATABASE=neon-write:latest \
		--task-timeout=30m \
		--max-retries=3 \
		--tasks=1 \
		--parallelism=1 \
		--update-env-vars GOOGLE_CLOUD_RUN=True
	@touch last_update

run:
	@gcloud run jobs execute $(JOB_NAME)
