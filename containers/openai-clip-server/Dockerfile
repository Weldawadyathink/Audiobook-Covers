FROM python:3.11-bullseye


LABEL org.opencontainers.image.source=https://github.com/Weldawadyathink/Audiobook-Covers



ENV PYTHONUNBUFFERED True
ENV APP_HOME /app
WORKDIR $APP_HOME


RUN apt-get update && \
    apt-get install -y git git-lfs && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://huggingface.co/sentence-transformers/clip-ViT-B-32



RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY ./requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt



COPY ./main.py ./main.py

ENV GUNICORN_WORKERS 1
ENV GUNICORN_THREADS 1
ENV GUNICORN_TIMEOUT 10

EXPOSE 80

CMD exec gunicorn --bind :80 --workers $GUNICORN_WORKERS --threads $GUNICORN_THREADS --preload --timeout $GUNICORN_TIMEOUT main:app
