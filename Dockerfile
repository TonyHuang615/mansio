# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.23-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/frontend/dist ./cmd/ghostterm/frontend/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /ghostterm ./cmd/ghostterm

# Stage 3: Runtime (Ubuntu + dev tools)
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        bash zsh tmux sudo curl wget git ca-certificates \
        build-essential python3 python3-pip \
        locales fonts-noto-cjk \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen \
    && useradd -m -s /bin/bash ghostterm \
    && echo "ghostterm ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
    && touch /home/ghostterm/.zshrc && chown ghostterm:ghostterm /home/ghostterm/.zshrc

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV LANGUAGE=en_US:en

WORKDIR /home/ghostterm
COPY --from=go-builder /ghostterm /usr/local/bin/ghostterm
RUN mkdir -p /data && chown ghostterm:ghostterm /data
USER ghostterm
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["ghostterm"]
CMD ["--port", "8080", "--data-dir", "/data"]
