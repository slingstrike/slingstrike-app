FROM node:24-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:docker

FROM caddy:2-alpine
COPY --from=builder /build/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN addgroup -S web \
    && adduser -S web -G web \
    && mkdir -p /config /data \
    && chown -R web:web /config /data /srv
USER web
