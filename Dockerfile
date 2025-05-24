FROM denoland/deno:alpine
WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install --frozen
COPY . .
RUN deno task build
RUN deno cache main.ts
EXPOSE 8000

CMD [ "deno", "task", "start" ]
