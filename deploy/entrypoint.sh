#!/bin/sh
set -e

MAX_RETRIES=10
RETRY_DELAY=3
attempt=1

echo "Applying database schema..."
while [ "$attempt" -le "$MAX_RETRIES" ]; do
  if npx drizzle-kit push --config ./drizzle.config.ts 2>&1; then
    echo "Database schema applied successfully."
    break
  fi
  echo "Schema push attempt $attempt/$MAX_RETRIES failed, retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
  attempt=$((attempt + 1))
done

if [ "$attempt" -gt "$MAX_RETRIES" ]; then
  echo "ERROR: Failed to apply database schema after $MAX_RETRIES attempts."
  exit 1
fi

echo "Starting server..."
exec node --enable-source-maps dist/index.mjs
