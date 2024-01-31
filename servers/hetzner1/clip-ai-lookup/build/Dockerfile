FROM python:3.11-bullseye



ENV PYTHONUNBUFFERED True
ENV GOOGLE_CLOUD_RUN True
ENV APP_HOME /app
WORKDIR $APP_HOME



RUN apt-get update && \
    apt-get install -y git git-lfs && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://huggingface.co/sentence-transformers/clip-ViT-B-32



RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY ./requirements.txt ./requirements.txt
RUN pip install -r requirements.txt



COPY ./main.py ./main.py



CMD exec gunicorn --log-level debug --bind :$PORT --workers 1 --threads 1 --preload --timeout 0 main:app
