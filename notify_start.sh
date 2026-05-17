#!/bin/sh
# notify_start.sh — Notifies the Go backend that a livestream has started.
# Invoked by NGINX RTMP's exec_publish directive when OBS connects.
#
# Usage (called automatically by NGINX):
#   /usr/local/bin/notify_start.sh <stream_key>
#
# Deps: curl, sh (all present in alfg/nginx-rtmp alpine base)

set -e

STREAM_KEY="${1}"
BACKEND_ENDPOINT="http://litestream_backend:8000"

# ─── Guard ──────────────────────────────────────────────────────────────────
if [ -z "${STREAM_KEY}" ]; then
    echo "[notify_start] ERROR: No stream key provided. Exiting." >&2
    exit 1
fi

echo "[notify_start] Stream '${STREAM_KEY}' started."

# ─── Notify Go Backend to Update DB Status ────────────────────────────────
echo "[notify_start] Updating stream status to 'live' in database..."
HTTP_STATUS=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST \
    --url "${BACKEND_ENDPOINT}/stream/start" \
    --header "Content-Type: application/json" \
    --data "{\"stream_key\":\"${STREAM_KEY}\", \"title\":\"Live Stream ${STREAM_KEY}\"}")

if [ "${HTTP_STATUS}" = "200" ]; then
    echo "[notify_start] SUCCESS: Database status updated to 'live'."
else
    echo "[notify_start] ERROR: Backend returned HTTP ${HTTP_STATUS}. DB update failed." >&2
    exit 1
fi

exit 0
