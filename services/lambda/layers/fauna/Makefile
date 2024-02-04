LAYER_NAME = fauna
LAYER_FILE_NAME = $(LAYER_NAME).zip
S3_BUCKET = 895931718529-us-west-1-lambda-layers

.PHONY: deploy

deploy: layer.zip


layer.zip: requirements.txt
	@echo "Installing packages to layer.zip"
	@rm -f layer.zip
	@docker run -v .:/mount amazonlinux /bin/sh -c '\
		yum update -q && yum install -y python3.11 zip findutils > /dev/null && \
		mkdir -p /package/python/lib/python3.11/site-packages && \
		python3.11 -m venv /venv && \
		/venv/bin/python -m pip install --upgrade pip > /dev/null && \
		/venv/bin/python -m pip install -r /mount/requirements.txt --target /package/python/lib/python3.11/site-packages > /dev/null && \
		cd /package && \
		find . -type d -name "__pycache__" -exec rm -rf {} + && \
		zip -r9 /mount/layer.zip * > /dev/null '
	@# Upload step is included here so that new version will not be uploaded unless it is modified
	@echo "Uploading layer to s3"
	@aws s3 cp ./layer.zip s3://$(S3_BUCKET)/$(LAYER_FILE_NAME)
	@aws lambda publish-layer-version --layer-name $(LAYER_NAME) \
		--content S3Bucket=$(S3_BUCKET),S3Key=$(LAYER_FILE_NAME) \
		--compatible-architectures arm64 \
		--compatible-runtimes python3.11 \
		--output text \
		> /dev/null

requirements.txt: requirements_minimal.txt
	@echo "Building complete requirements.txt"
	@rm -f requirements.txt
	@docker run -v .:/mount	amazonlinux /bin/sh -c '\
		yum update -q && yum install -y python3.11 > /dev/null && \
		python3.11 -m venv /venv && \
		/venv/bin/python -m pip install --upgrade pip > /dev/null && \
		/venv/bin/python -m pip install -r /mount/requirements_minimal.txt > /dev/null && \
		/venv/bin/python -m pip freeze > /mount/requirements.txt \
		'