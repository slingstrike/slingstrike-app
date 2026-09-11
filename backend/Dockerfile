FROM python:3.12-alpine AS builder
RUN apk add --no-cache gcc musl-dev libffi-dev
WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-alpine
RUN apk add --no-cache su-exec \
    && addgroup -S olf \
    && adduser -S olf -G olf \
    && mkdir -p /data \
    && chown olf:olf /data
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /usr/local/bin/alembic /usr/local/bin/alembic
COPY backend/ .
COPY library/ /library
RUN chmod +x /app/entrypoint.sh
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV OLF_LIBRARY_DIR=/library/community
ENV OLF_SIEM_PROFILES_DIR=/library/siem-profiles
# No USER here - entrypoint starts as root to chown /data, then drops to olf via su-exec
ENTRYPOINT ["/app/entrypoint.sh"]
