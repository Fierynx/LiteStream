#!/bin/sh
# notify_vod.sh — Notifies the SQS queue that a VOD recording is ready.
# Invoked by NGINX RTMP's exec_publish_done directive when OBS disconnects.
#
# Usage (called automatically by NGINX):
#   /usr/local/bin/notify_vod.sh <stream_key>
#
# Deps: curl, sh (all present in alfg/nginx-rtmp alpine base)

set -e

STREAM_KEY="${1}"
LOCALSTACK_ENDPOINT="http://litestream_localstack:4566"
REGION="us-east-1"
QUEUE_NAME="vod-queue"
ACCOUNT_ID="000000000000"   # LocalStack's synthetic account ID

# ─── Guard ──────────────────────────────────────────────────────────────────
if [ -z "${STREAM_KEY}" ]; then
    echo "[notify_vod] ERROR: No stream key provided. Exiting." >&2
    exit 1
fi

echo "[notify_vod] Stream '${STREAM_KEY}' ended. Notifying VOD queue..."

# ─── Build the SQS queue URL ─────────────────────────────────────────────────
QUEUE_URL="${LOCALSTACK_ENDPOINT}/${ACCOUNT_ID}/${QUEUE_NAME}"

# ─── URL-encode the message body ─────────────────────────────────────────────
# The SQS Query API requires form-encoded parameters.
MESSAGE_BODY="${STREAM_KEY}.m3u8"

# ─── Send SQS SendMessage via the Query API using curl ───────────────────────
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
    exit 1
fi

rm -f /tmp/sqs_response.xml
exit 0
