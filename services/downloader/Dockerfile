FROM python:3.11-bullseye


LABEL org.opencontainers.image.source=https://github.com/Weldawadyathink/Audiobook-Covers



ENV PYTHONUNBUFFERED True
ENV APP_HOME /app
WORKDIR $APP_HOME



COPY ./requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt



COPY . .

CMD python ./main.py