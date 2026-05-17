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

# ─── 1. Notify Go Backend to Update DB Status ────────────────────────────────
echo "[notify_vod] Updating stream status to 'vod' in database..."
DB_HTTP_STATUS=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST \
    --url "${BACKEND_ENDPOINT}/stream/end" \
    --header "Content-Type: application/json" \
    --data "{\"stream_key\":\"${STREAM_KEY}\"}")

if [ "${DB_HTTP_STATUS}" = "200" ]; then
    echo "[notify_vod] SUCCESS: Database status updated to 'vod'."
else
    echo "[notify_vod] WARNING: Backend returned HTTP ${DB_HTTP_STATUS}. DB update may have failed." >&2
fi

# ─── Build the SQS queue URL ─────────────────────────────────────────────────
QUEUE_URL="${LOCALSTACK_ENDPOINT}/${ACCOUNT_ID}/${QUEUE_NAME}"

# ─── URL-encode the message body ─────────────────────────────────────────────
# The SQS Query API requires form-encoded parameters.
MESSAGE_BODY="${STREAM_KEY}.m3u8"

# ─── 2. Send SQS SendMessage via the Query API using curl ────────────────────
echo "[notify_vod] Notifying VOD queue..."
HTTP_STATUS=$(curl \
    --silent \
    --output /tmp/sqs_response.xml \
    --write-out "%{http_code}" \
    --request POST \
    --url "${QUEUE_URL}" \
    --header "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "Action=SendMessage" \
    --data-urlencode "MessageBody=${MESSAGE_BODY}" \
    --data-urlencode "Version=2012-11-05")

# ─── Verify response ─────────────────────────────────────────────────────────
if [ "${HTTP_STATUS}" = "200" ]; then
    MSG_ID=$(grep -o '<MessageId>[^<]*</MessageId>' /tmp/sqs_response.xml | sed 's/<[^>]*>//g')
    echo "[notify_vod] SUCCESS: Message enqueued. MessageId=${MSG_ID} Stream=${MESSAGE_BODY}"
else
    echo "[notify_vod] ERROR: SQS returned HTTP ${HTTP_STATUS}. Response:" >&2
    cat /tmp/sqs_response.xml >&2
    rm -f /tmp/sqs_response.xml
    exit 1
fi

rm -f /tmp/sqs_response.xml
exit 0