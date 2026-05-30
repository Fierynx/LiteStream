#!/bin/sh
# notify_vod.sh — Notifies the SQS queue that a VOD recording is ready, 
# and updates the Go backend database status to "vod".
# Invoked by NGINX RTMP's exec_publish_done directive when OBS disconnects.
#
# Usage (called automatically by NGINX):
#   /usr/local/bin/notify_vod.sh <stream_key>
#
# Deps: curl, sh (all present in alfg/nginx-rtmp alpine base)

set -e

STREAM_KEY="${1}"
LOCALSTACK_ENDPOINT="http://litestream_localstack:4566"
BACKEND_ENDPOINT="http://litestream_backend:8000"
REGION="us-east-1"
QUEUE_NAME="vod-queue"
ACCOUNT_ID="000000000000"   # LocalStack's synthetic account ID

# ─── Guard ──────────────────────────────────────────────────────────────────
if [ -z "${STREAM_KEY}" ]; then
    echo "[notify_vod] ERROR: No stream key provided. Exiting." >&2
    exit 1
fi

echo "[notify_vod] Stream '${STREAM_KEY}' ended."

# ─── 1. Notify Go Backend to Update DB Status and Send SQS ───────────────────
echo "[notify_vod] Updating stream status to 'vod' in database..."
curl_out=$(curl \
    --silent \
    --write-out "|%{http_code}" \
    --request POST \
    --url "${BACKEND_ENDPOINT}/stream/end" \
    --header "Content-Type: application/json" \
    --data "{\"stream_key\":\"${STREAM_KEY}\"}")

DB_HTTP_STATUS=$(echo "${curl_out}" | awk -F '|' '{print $2}')
JSON_RES=$(echo "${curl_out}" | awk -F '|' '{print $1}')

if [ "${DB_HTTP_STATUS}" = "200" ]; then
    echo "[notify_vod] SUCCESS: Database status updated to 'vod' and SQS message enqueued."
else
    echo "[notify_vod] WARNING: Backend returned HTTP ${DB_HTTP_STATUS}. DB update or SQS may have failed. Response: ${JSON_RES}" >&2
    exit 1
fi

exit 0