#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$INSTALL_DIR/vpn-panel.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "VPN Control Panel не запущена (PID-файл не найден)"
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "Остановка VPN Control Panel (PID $PID)..."
  kill "$PID"
  sleep 2
  if kill -0 "$PID" 2>/dev/null; then
    echo "Процесс не завершился, принудительная остановка..."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "VPN Control Panel остановлена."
else
  echo "Процесс $PID уже не существует."
fi

rm -f "$PID_FILE"
