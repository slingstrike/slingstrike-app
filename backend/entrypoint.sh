#!/bin/sh
set -e
chown -R olf:olf /data

# Back up the database before migration so a failed upgrade can be rolled back
if [ -f /data/SlingStrike.db ]; then
    su-exec olf cp /data/SlingStrike.db /data/SlingStrike.db.bak
fi

su-exec olf alembic upgrade head
exec su-exec olf uvicorn main:app --host 0.0.0.0 --port 8000
