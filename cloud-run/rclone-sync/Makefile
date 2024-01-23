DEPLOY_FILES := entrypoint.sh Dockerfile Makefile

.PHONY: deploy

deploy: last_update

last_update: $(DEPLOY_FILES)
	@touch last_update
	@gcloud run jobs deploy rclone-sync --source . \
		--region us-central1 --cpu 1 --memory 512Mi \
		--task-timeout=15m \
		--max-retries=0 \
		--parallelism=1 \
		--set-secrets=RCLONE_CONFIG=rclone-config:latest \
