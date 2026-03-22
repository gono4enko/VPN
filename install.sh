#!/usr/bin/env bash
set -euo pipefail

REPO="gono4enko/VPN"
APP_NAME="vpn-panel"
DEFAULT_PORT=3000

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       error "Неподдерживаемая ОС: $(uname -s)"; exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)   echo "x86_64" ;;
    arm64|aarch64)   echo "arm64" ;;
    *)               error "Неподдерживаемая архитектура: $(uname -m)"; exit 1 ;;
  esac
}

check_command() {
  command -v "$1" &>/dev/null
}

get_latest_version() {
  if check_command curl; then
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | \
      grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//'
  elif check_command wget; then
    wget -qO- "https://api.github.com/repos/$REPO/releases/latest" | \
      grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//'
  else
    error "Необходим curl или wget для загрузки"
    exit 1
  fi
}

install_node_hint() {
  local os="$1"
  echo ""
  warn "Node.js 22+ не найден!"
  echo ""
  if [ "$os" = "linux" ]; then
    echo "  Установите Node.js:"
    echo "    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
    echo "    sudo apt-get install -y nodejs"
  else
    echo "  Установите Node.js через Homebrew:"
    echo "    brew install node@22"
  fi
  echo ""
}

setup_postgres_hint() {
  local os="$1"
  echo ""
  warn "PostgreSQL не найден или не запущен!"
  echo ""
  if [ "$os" = "linux" ]; then
    echo "  Установите PostgreSQL:"
    echo "    sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib"
    echo "    sudo systemctl start postgresql"
    echo "    sudo systemctl enable postgresql"
  else
    echo "  Установите PostgreSQL через Homebrew:"
    echo "    brew install postgresql@16"
    echo "    brew services start postgresql@16"
  fi
  echo ""
}

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     VPN Control Panel — Установка        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

OS=$(detect_os)
ARCH=$(detect_arch)
info "ОС: $OS, Архитектура: $ARCH"

if [ "$OS" = "linux" ]; then
  INSTALL_DIR="/opt/$APP_NAME"
else
  INSTALL_DIR="$HOME/$APP_NAME"
fi

read -rp "Директория установки [$INSTALL_DIR]: " CUSTOM_DIR
INSTALL_DIR="${CUSTOM_DIR:-$INSTALL_DIR}"

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
  warn "VPN Control Panel уже установлена в $INSTALL_DIR"
  read -rp "Переустановить? (y/N): " REINSTALL
  if [[ "$REINSTALL" != "y" && "$REINSTALL" != "Y" ]]; then
    echo "Отменено."
    exit 0
  fi
fi

NODE_OK=false
if check_command node; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 22 ]; then
    ok "Node.js v$(node -v | sed 's/v//') найден"
    NODE_OK=true
  else
    warn "Node.js $(node -v) найден, но требуется v22+"
  fi
fi

if [ "$NODE_OK" = false ]; then
  install_node_hint "$OS"
  read -rp "Продолжить установку без Node.js? (y/N): " CONTINUE
  if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
    exit 1
  fi
fi

PG_OK=false
if check_command psql; then
  ok "PostgreSQL найден"
  PG_OK=true
else
  setup_postgres_hint "$OS"
  read -rp "Продолжить установку без PostgreSQL? (y/N): " CONTINUE
  if [[ "$CONTINUE" != "y" && "$CONTINUE" != "Y" ]]; then
    exit 1
  fi
fi

info "Получение последней версии..."
VERSION=$(get_latest_version)
if [ -z "$VERSION" ]; then
  error "Не удалось получить версию. Проверьте доступ к GitHub."
  read -rp "Введите версию вручную (например, 1.0.0): " VERSION
  if [ -z "$VERSION" ]; then
    exit 1
  fi
fi
ok "Версия: $VERSION"

ARCHIVE="vpn-panel-${VERSION}-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/v${VERSION}/${ARCHIVE}"

info "Загрузка $ARCHIVE..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if check_command curl; then
  curl -fSL "$DOWNLOAD_URL" -o "$TMP_DIR/$ARCHIVE"
elif check_command wget; then
  wget -q "$DOWNLOAD_URL" -O "$TMP_DIR/$ARCHIVE"
fi

ok "Загрузка завершена"

info "Распаковка..."
cd "$TMP_DIR"
tar -xzf "$ARCHIVE"
EXTRACTED_DIR=$(ls -d vpn-panel-* | head -1)

if [ "$OS" = "linux" ]; then
  sudo mkdir -p "$INSTALL_DIR"
  sudo cp -a "$TMP_DIR/$EXTRACTED_DIR/." "$INSTALL_DIR/"
  sudo chown -R "$(whoami):$(id -gn)" "$INSTALL_DIR"
else
  mkdir -p "$INSTALL_DIR"
  cp -a "$TMP_DIR/$EXTRACTED_DIR/." "$INSTALL_DIR/"
fi

ok "Распаковано в $INSTALL_DIR"

info "Установка зависимостей..."
cd "$INSTALL_DIR"
npm install --production 2>/dev/null || warn "npm install не удался — установите зависимости вручную"

ok "Зависимости установлены"

echo ""
info "Настройка конфигурации..."

if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"

  read -rp "Порт панели [$DEFAULT_PORT]: " USER_PORT
  USER_PORT="${USER_PORT:-$DEFAULT_PORT}"

  DB_PASSWORD=""
  read -rsp "Пароль PostgreSQL для пользователя vpn_panel: " DB_PASSWORD
  echo ""
  if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD="vpn_panel_$(openssl rand -hex 8 2>/dev/null || echo "changeme")"
    warn "Пароль сгенерирован автоматически: $DB_PASSWORD"
  fi

  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '=+/' | head -c 64)

  sed -i.bak "s|PORT=3000|PORT=$USER_PORT|" "$INSTALL_DIR/.env"
  sed -i.bak "s|your_password_here|$DB_PASSWORD|" "$INSTALL_DIR/.env"
  sed -i.bak "s|change_me_to_random_secret|$JWT_SECRET|" "$INSTALL_DIR/.env"
  rm -f "$INSTALL_DIR/.env.bak"

  ok "Конфигурация сохранена в $INSTALL_DIR/.env"
else
  ok "Файл .env уже существует, пропускаем настройку"
fi

if [ "$PG_OK" = true ]; then
  info "Настройка базы данных..."
  read -rp "Создать пользователя и базу данных PostgreSQL? (Y/n): " SETUP_DB
  if [[ "$SETUP_DB" != "n" && "$SETUP_DB" != "N" ]]; then
    DB_PASSWORD="${DB_PASSWORD:-$(grep -E '^DATABASE_URL=' "$INSTALL_DIR/.env" 2>/dev/null | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|' || echo "changeme")}"
    sudo -u postgres createuser vpn_panel 2>/dev/null || warn "Пользователь vpn_panel уже существует"
    sudo -u postgres createdb vpn_panel -O vpn_panel 2>/dev/null || warn "База данных vpn_panel уже существует"
    sudo -u postgres psql -c "ALTER USER vpn_panel PASSWORD '$DB_PASSWORD';" 2>/dev/null || warn "Не удалось установить пароль"
    ok "База данных настроена"

    info "Инициализация схемы базы данных..."
    set -a; source "$INSTALL_DIR/.env"; set +a
    cd "$INSTALL_DIR"
    npx drizzle-kit push --config db/drizzle.config.ts 2>/dev/null || warn "Не удалось инициализировать схему — выполните вручную"
    ok "Схема базы данных инициализирована"
  fi
fi

if [ "$OS" = "linux" ] && check_command systemctl; then
  info "Настройка systemd-сервиса..."
  read -rp "Создать systemd-сервис для автозапуска? (Y/n): " SETUP_SYSTEMD
  if [[ "$SETUP_SYSTEMD" != "n" && "$SETUP_SYSTEMD" != "N" ]]; then
    NODE_PATH=$(which node)
    sudo tee /etc/systemd/system/vpn-panel.service > /dev/null <<SYSTEMD
[Unit]
Description=VPN Control Panel
After=network.target postgresql.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
Environment=NODE_ENV=production
Environment=STATIC_DIR=$INSTALL_DIR/public
ExecStart=$NODE_PATH --enable-source-maps $INSTALL_DIR/server/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD

    sudo systemctl daemon-reload
    sudo systemctl enable vpn-panel
    sudo systemctl start vpn-panel

    ok "Systemd-сервис создан и запущен"
  fi
elif [ "$OS" = "darwin" ]; then
  info "Настройка launchd-агента..."
  read -rp "Создать launchd-агент для автозапуска? (y/N): " SETUP_LAUNCHD
  if [[ "$SETUP_LAUNCHD" == "y" || "$SETUP_LAUNCHD" == "Y" ]]; then
    NODE_PATH=$(which node)
    PLIST_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$PLIST_DIR"

    cat > "$PLIST_DIR/com.vpn-panel.plist" <<LAUNCHD
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vpn-panel</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>--enable-source-maps</string>
    <string>$INSTALL_DIR/server/index.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>STATIC_DIR</key>
    <string>$INSTALL_DIR/public</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/vpn-panel.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/vpn-panel-error.log</string>
</dict>
</plist>
LAUNCHD

    launchctl load "$PLIST_DIR/com.vpn-panel.plist"
    ok "Launchd-агент создан и запущен"
  fi
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Установка завершена!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Директория: $INSTALL_DIR"
echo "  Панель:     http://localhost:${USER_PORT:-$DEFAULT_PORT}"
echo ""
echo "  Управление:"
echo "    $INSTALL_DIR/start.sh   — запуск"
echo "    $INSTALL_DIR/stop.sh    — остановка"
echo "    $INSTALL_DIR/status.sh  — статус"
echo ""
echo "  Документация: $INSTALL_DIR/README.md"
echo ""
