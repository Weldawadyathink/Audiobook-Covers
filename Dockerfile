# Base image
FROM denoland/deno:ubuntu AS builder

# Build server file and dist
WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install --frozen --allow-scripts

COPY index.html vite.config.ts ./
COPY src ./src
COPY public ./public
RUN deno task build

# Final build
FROM ubuntu:latest AS app
WORKDIR /app

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/server ./server

EXPOSE 8000
ENV NODE_ENV=production
CMD [ "/app/server" ]
