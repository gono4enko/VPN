#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$INSTALL_DIR/vpn-panel.pid"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "VPN Control Panel уже запущена (PID $OLD_PID)"
    echo "Используйте ./stop.sh для остановки"
    exit 1
  fi
  rm -f "$PID_FILE"
fi

if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo "Файл .env не найден!"
  echo "Скопируйте .env.example в .env и настройте параметры:"
  echo "  cp .env.example .env"
  exit 1
fi

set -a
source "$INSTALL_DIR/.env"
set +a

export NODE_ENV=production
export STATIC_DIR="$INSTALL_DIR/public"

echo "Запуск VPN Control Panel..."
cd "$INSTALL_DIR"
nohup node --enable-source-maps server/index.mjs > "$INSTALL_DIR/vpn-panel.log" 2>&1 &
echo $! > "$PID_FILE"

sleep 2

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "VPN Control Panel запущена (PID $(cat "$PID_FILE"))"
  echo "Панель доступна по адресу: http://localhost:${PORT:-3000}"
  echo "Логи: $INSTALL_DIR/vpn-panel.log"
else
  echo "Ошибка запуска! Проверьте логи:"
  echo "  tail -50 $INSTALL_DIR/vpn-panel.log"
  rm -f "$PID_FILE"
  exit 1
fi
