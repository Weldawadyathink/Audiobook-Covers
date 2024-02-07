FROM python:3.11-bullseye

ENV PYTHONUNBUFFERED True
ENV GOOGLE_CLOUD_RUN True
ENV APP_HOME /app
WORKDIR $APP_HOME
COPY ./requirements.txt ./requirements.txt

RUN --mount=type=cache,target=/root/.cache \
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

RUN --mount=type=cache,target=/root/.cache \
    pip install -r requirements.txt

RUN apt-get update && \
    apt-get install -y git git-lfs && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/*

RUN git clone https://huggingface.co/sentence-transformers/clip-ViT-B-32

COPY ./main.py ./

CMD python /app/main.py
