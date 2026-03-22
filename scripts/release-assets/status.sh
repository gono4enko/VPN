#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$INSTALL_DIR/vpn-panel.pid"

echo "=== VPN Control Panel — Статус ==="

if [ -f "$INSTALL_DIR/package.json" ]; then
  VERSION=$(node -p "require('$INSTALL_DIR/package.json').version" 2>/dev/null || echo "unknown")
  echo "Версия: $VERSION"
fi

echo "Директория: $INSTALL_DIR"

if [ ! -f "$PID_FILE" ]; then
  echo "Статус: ОСТАНОВЛЕНА"
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "Статус: ЗАПУЩЕНА (PID $PID)"
  if [ -f "$INSTALL_DIR/.env" ]; then
    PORT=$(grep -E "^PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3000")
    echo "Адрес: http://localhost:${PORT:-3000}"
  fi
else
  echo "Статус: ОСТАНОВЛЕНА (устаревший PID-файл)"
  rm -f "$PID_FILE"
fi

if [ -f "$INSTALL_DIR/vpn-panel.log" ]; then
  echo ""
  echo "--- Последние 10 строк лога ---"
  tail -10 "$INSTALL_DIR/vpn-panel.log"
fi
