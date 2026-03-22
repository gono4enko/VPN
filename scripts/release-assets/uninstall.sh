#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Удаление VPN Control Panel ==="
echo "Директория установки: $INSTALL_DIR"
echo ""

read -rp "Вы уверены, что хотите удалить VPN Control Panel? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Отменено."
  exit 0
fi

if [ -f "$INSTALL_DIR/stop.sh" ]; then
  bash "$INSTALL_DIR/stop.sh" 2>/dev/null || true
fi

if [ -f /etc/systemd/system/vpn-panel.service ]; then
  echo "Удаление systemd-сервиса..."
  sudo systemctl stop vpn-panel 2>/dev/null || true
  sudo systemctl disable vpn-panel 2>/dev/null || true
  sudo rm -f /etc/systemd/system/vpn-panel.service
  sudo systemctl daemon-reload
  echo "Systemd-сервис удалён."
fi

LAUNCHD_PLIST="$HOME/Library/LaunchAgents/com.vpn-panel.plist"
if [ -f "$LAUNCHD_PLIST" ]; then
  echo "Удаление launchd-агента..."
  launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
  rm -f "$LAUNCHD_PLIST"
  echo "Launchd-агент удалён."
fi

read -rp "Удалить директорию $INSTALL_DIR? (y/N): " CONFIRM_DIR
if [[ "$CONFIRM_DIR" == "y" || "$CONFIRM_DIR" == "Y" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "Директория удалена."
else
  echo "Директория сохранена."
fi

echo ""
echo "VPN Control Panel удалена."
echo "Примечание: база данных PostgreSQL НЕ была удалена."
echo "Для удаления базы данных выполните:"
echo "  sudo -u postgres dropdb vpn_panel"
