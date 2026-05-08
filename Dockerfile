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

# Stage 3: Runtime
FROM alpine:3.20
RUN apk add --no-cache bash zsh tmux shadow sudo \
    && adduser -D -h /home/ghostterm ghostterm \
    && echo "ghostterm ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
WORKDIR /home/ghostterm
COPY --from=go-builder /ghostterm /usr/local/bin/ghostterm
RUN mkdir -p /data && chown ghostterm:ghostterm /data
USER ghostterm
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["ghostterm"]
CMD ["--port", "8080", "--data-dir", "/data"]
