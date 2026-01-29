FROM alpine:latest AS clip-downloader
RUN apk add curl
# Download all models into a single layer; easier caching with repeated builds
RUN curl https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s0.pt -o /weights/mobileclip_s0.pt --create-dirs
RUN curl https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s1.pt -o /weights/mobileclip_s1.pt --create-dirs
RUN curl https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_s2.pt -o /weights/mobileclip_s2.pt --create-dirs
RUN curl https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_b.pt -o /weights/mobileclip_b.pt --create-dirs
RUN curl https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/mobileclip_blt.pt -o /weights/mobileclip_blt.pt --create-dirs

FROM python:3.13-bookworm AS builder-python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN mkdir -p /app/clip_server
WORKDIR /app/clip_server
RUN python -m venv .venv
RUN .venv/bin/pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cpu
COPY clip_server/requirements.txt .
RUN .venv/bin/pip install -r requirements.txt
COPY clip_server/ .

FROM node:24-bookworm AS builder-node
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

FROM builder-node AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM builder-node AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . ./
RUN pnpm run build

FROM python:3.13-slim-bookworm AS final
WORKDIR /app
RUN mkdir -p /app/clip_server
COPY --from=builder-node /usr/local/bin/node /usr/local/bin/node
COPY --from=builder-python /app/clip_server /app/clip_server
COPY --from=clip-downloader /weights/mobileclip_s0.pt /app/clip_server/weights/mobileclip_s0.pt
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/.output /app/.output

# Web server
EXPOSE 3000

# Clip server
EXPOSE 8000
