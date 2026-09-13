FROM node:24-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:docker

FROM caddy:2-alpine AS runtime
COPY --from=builder /build/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN addgroup -S web \
    && adduser -S web -G web \
    && mkdir -p /config /data \
    && chown -R web:web /config /data /srv
# Copy the runtime filesystem without inheriting Caddy's unused EXPOSE ports.
FROM scratch
COPY --from=runtime / /
ENV XDG_CONFIG_HOME=/config
ENV XDG_DATA_HOME=/data
WORKDIR /srv
USER web
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
