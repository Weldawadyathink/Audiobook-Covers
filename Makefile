.PHONY: deploy_lambda_functions deploy_lambda_layers deploy_workers deploy

ALL_FUNCTION_MAKEFILES := $(shell find ./functions -name Makefile)

ALL_LAYERS_MAKEFILES := $(shell find ./layers -name Makefile)

ALL_WORKERS_MAKEFILES := $(shell find ./workers -name 'node_modules' -prune -o -name 'Makefile' -print)

ALL_CLOUD_RUN_MAKEFILES := $(shell find ./cloud-run -name Makefile)

deploy: deploy_lambda_layers deploy_lambda_functions deploy_workers deploy_cloud_run

deploy_lambda_functions:
	@echo "Deploying all lambda functions"
	@for makefile in $(ALL_FUNCTION_MAKEFILES); do \
		echo Deploying $$makefile; \
		$(MAKE) -C $$(dirname $$makefile) deploy; \
	done

deploy_lambda_layers:
	@echo "Deploying all lambda layers"
	@for makefile in $(ALL_LAYERS_MAKEFILES); do \
		echo Deploying $$makefile; \
		$(MAKE) -C $$(dirname $$makefile) deploy; \
	done

deploy_workers:
	@echo "Deploying all Cloudflare Workers"
	@for makefile in $(ALL_WORKERS_MAKEFILES); do \
		echo Deploying $$makefile; \
		$(MAKE) -C $$(dirname $$makefile) deploy; \
	done

deploy_cloud_run:
	@echo "Deploying all Cloud Run images"
	@for makefile in $(ALL_CLOUD_RUN_MAKEFILES); do \
		echo Deploying $$makefile; \
		$(MAKE) -C $$(dirname $$makefile) deploy; \
	done
