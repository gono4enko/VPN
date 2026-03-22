#!/usr/bin/env bash
set -euo pipefail

REPO="gono4enko/VPN"
REPO_URL="https://github.com/$REPO.git"
APP_NAME="vpn-panel"
DEFAULT_PORT=3000
PG_DB="vpn_panel"
PG_USER="vpn_panel"
NODE_MIN=20

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }
step()  { echo -e "\n${CYAN}── $* ──${NC}"; }

check_cmd() { command -v "$1" &>/dev/null; }

detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       fail "Неподдерживаемая ОС: $(uname -s)"; exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x86_64" ;;
    arm64|aarch64)  echo "arm64" ;;
    *)              fail "Неподдерживаемая архитектура: $(uname -m)"; exit 1 ;;
  esac
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   VPN Control Panel — Автоматическая установка  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

OS=$(detect_os)
ARCH=$(detect_arch)
info "Платформа: $OS/$ARCH"

if [ "$OS" = "darwin" ]; then
  INSTALL_DIR="$HOME/$APP_NAME"
else
  INSTALL_DIR="/opt/$APP_NAME"
fi

step "1/7 — Homebrew (только macOS)"

if [ "$OS" = "darwin" ]; then
  if check_cmd brew; then
    ok "Homebrew уже установлен"
  else
    info "Установка Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
    ok "Homebrew установлен"
  fi
else
  info "Linux — Homebrew не требуется"
fi

step "2/7 — Git"

if check_cmd git; then
  ok "Git найден: $(git --version)"
else
  info "Установка Git..."
  if [ "$OS" = "darwin" ]; then
    brew install git
  else
    sudo apt-get update -qq && sudo apt-get install -y -qq git
  fi
  ok "Git установлен"
fi

step "3/7 — Node.js"

ensure_node() {
  if check_cmd node; then
    local ver
    ver=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$ver" -ge "$NODE_MIN" ]; then
      ok "Node.js v$(node -v | sed 's/v//') найден"
      return 0
    else
      warn "Node.js v$(node -v | sed 's/v//') — слишком старая, нужна v${NODE_MIN}+"
    fi
  fi
  info "Установка Node.js..."
  if [ "$OS" = "darwin" ]; then
    brew install node
  else
    if check_cmd curl; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    else
      sudo apt-get update -qq && sudo apt-get install -y -qq curl
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    fi
    sudo apt-get install -y -qq nodejs
  fi
  ok "Node.js v$(node -v | sed 's/v//') установлен"
}
ensure_node

step "4/7 — pnpm"

if check_cmd pnpm; then
  ok "pnpm найден: v$(pnpm -v)"
else
  info "Установка pnpm..."
  npm install -g pnpm
  ok "pnpm установлен: v$(pnpm -v)"
fi

step "5/7 — PostgreSQL"

find_pg_bin() {
  if check_cmd psql; then
    return 0
  fi
  for pg_path in /opt/homebrew/opt/postgresql@{17,16,15,14}/bin /usr/local/opt/postgresql@{17,16,15,14}/bin /usr/lib/postgresql/{17,16,15,14}/bin; do
    if [ -x "$pg_path/psql" ]; then
      export PATH="$pg_path:$PATH"
      return 0
    fi
  done
  return 1
}

ensure_postgres() {
  if find_pg_bin; then
    ok "PostgreSQL CLI найден: $(psql --version | head -1)"
  else
    info "Установка PostgreSQL..."
    if [ "$OS" = "darwin" ]; then
      brew install postgresql@16
      for pg_path in /opt/homebrew/opt/postgresql@{17,16,15,14}/bin /usr/local/opt/postgresql@{17,16,15,14}/bin; do
        if [ -x "$pg_path/psql" ]; then
          export PATH="$pg_path:$PATH"
          break
        fi
      done
    else
      sudo apt-get update -qq && sudo apt-get install -y -qq postgresql postgresql-contrib
    fi
    ok "PostgreSQL установлен"
  fi

  if [ "$OS" = "darwin" ]; then
    if ! brew services list 2>/dev/null | grep -q "postgresql.*started"; then
      info "Запуск PostgreSQL..."
      brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
      sleep 2
    fi
    ok "PostgreSQL запущен (Homebrew)"
  else
    if ! sudo systemctl is-active --quiet postgresql 2>/dev/null; then
      info "Запуск PostgreSQL..."
      sudo systemctl start postgresql
      sudo systemctl enable postgresql
    fi
    ok "PostgreSQL запущен (systemd)"
  fi
}
ensure_postgres

ensure_xray() {
  if command -v xray &>/dev/null; then
    ok "Xray найден: $(xray version 2>/dev/null | head -1)"
    return
  fi

  info "Установка Xray..."
  if [ "$OS" = "darwin" ]; then
    brew install xray
  else
    bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
  fi

  if command -v xray &>/dev/null; then
    ok "Xray установлен: $(xray version 2>/dev/null | head -1)"
  else
    warn "Не удалось установить Xray автоматически. Установите вручную: https://github.com/XTLS/Xray-core"
  fi
}

step "6/8 — Xray"
ensure_xray

step "7/8 — Клонирование и сборка"

info "Остановка предыдущего экземпляра (если есть)..."
OLD_PID=$(pgrep -f "dist/index.mjs" || true)
if [ -n "$OLD_PID" ]; then
  kill $OLD_PID 2>/dev/null || true
  sleep 1
  kill -9 $OLD_PID 2>/dev/null || true
  ok "Старый процесс (PID: $OLD_PID) остановлен"
else
  info "Запущенных процессов не найдено"
fi

XRAY_PID=$(pgrep -f "xray run" || true)
if [ -n "$XRAY_PID" ]; then
  kill $XRAY_PID 2>/dev/null || true
  ok "Xray процесс (PID: $XRAY_PID) остановлен"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Обновление существующей установки в $INSTALL_DIR..."
  cd "$INSTALL_DIR"
  git fetch origin main
  git reset --hard origin/main
  ok "Код обновлён"
else
  info "Клонирование $REPO в $INSTALL_DIR..."
  if [ "$OS" = "linux" ]; then
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown "$(whoami):$(id -gn)" "$INSTALL_DIR"
  else
    mkdir -p "$INSTALL_DIR"
  fi
  git clone "$REPO_URL" "$INSTALL_DIR"
  ok "Репозиторий клонирован"
fi

cd "$INSTALL_DIR"

info "Установка зависимостей..."
rm -f pnpm-lock.yaml
rm -rf node_modules artifacts/*/node_modules lib/*/node_modules

info "Удаление Replit-специфичных зависимостей..."

cat > pnpm-workspace.yaml << 'CLEANEOF'
packages:
  - artifacts/*
  - lib/*
  - lib/integrations/*
  - scripts

autoInstallPeers: false

catalog:
  '@tailwindcss/vite': ^4.1.14
  '@tanstack/react-query': ^5.90.21
  '@types/node': ^25.3.3
  '@types/react': ^19.2.0
  '@types/react-dom': ^19.2.0
  '@vitejs/plugin-react': ^5.0.4
  class-variance-authority: ^0.7.1
  clsx: 2.1.1
  drizzle-orm: ^0.45.1
  framer-motion: 12.35.1
  lucide-react: 0.545.0
  react: 19.1.0
  react-dom: 19.1.0
  tailwind-merge: 3.5.0
  tailwindcss: ^4.1.14
  tsx: ^4.21.0
  vite: ^7.3.0
  zod: ^3.25.76
CLEANEOF
ok "pnpm-workspace.yaml перезаписан (чистая версия)"

node -e "
var f=require('fs');
var replit=['@replit/vite-plugin-cartographer','@replit/vite-plugin-dev-banner','@replit/vite-plugin-runtime-error-modal','@replit/connectors-sdk'];
function clean(path){
  if(!f.existsSync(path))return;
  var pkg=JSON.parse(f.readFileSync(path,'utf8'));
  replit.forEach(function(d){
    if(pkg.dependencies)delete pkg.dependencies[d];
    if(pkg.devDependencies)delete pkg.devDependencies[d];
  });
  f.writeFileSync(path,JSON.stringify(pkg,null,2)+'\n');
}
clean('package.json');
clean('artifacts/vpn-panel/package.json');
clean('artifacts/mockup-sandbox/package.json');
console.log('package.json files cleaned');
" || true

pnpm install

ok "Зависимости установлены"

info "Сборка проекта..."
export PORT=3000
export BASE_PATH="/"
export NODE_ENV=production

if node scripts/build-prod.mjs; then
  ok "Сборка завершена (build-prod)"
else
  warn "build-prod не удался, собираем вручную..."
  pnpm --filter @workspace/vpn-panel run build || { fail "Сборка vpn-panel не удалась"; exit 1; }
  pnpm --filter @workspace/api-server run build || { fail "Сборка api-server не удалась"; exit 1; }

  mkdir -p deploy/dist
  cp -r artifacts/api-server/dist/* deploy/dist/
  mkdir -p deploy/dist/public
  cp -r artifacts/vpn-panel/dist/public/* deploy/dist/public/
  mkdir -p deploy/db-schema
  cp -r lib/db/src/schema/* deploy/db-schema/

  cat > deploy/package.json <<PKGJSON
{
  "name": "vpn-panel-deploy",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --enable-source-maps dist/index.mjs",
    "db:push": "drizzle-kit push --config ./drizzle.config.ts"
  },
  "dependencies": {
    "drizzle-kit": "^0.31.9",
    "drizzle-orm": "^0.45.1",
    "drizzle-zod": "^0.7.1",
    "pg": "^8.20.0",
    "zod": "^3.25.76"
  }
}
PKGJSON
  ok "Сборка завершена (ручная)"
fi

step "8/8 — Настройка базы данных и конфигурация"

DB_PASSWORD="vpn_$(openssl rand -hex 8 2>/dev/null || echo "changeme123")"
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '=+/' | head -c 64)
APP_PORT="${APP_PORT:-$DEFAULT_PORT}"

DATABASE_URL="postgresql://${PG_USER}:${DB_PASSWORD}@localhost:5432/${PG_DB}"

info "Создание пользователя и базы данных PostgreSQL..."

if [ "$OS" = "darwin" ]; then
  createuser "$PG_USER" 2>/dev/null && ok "Пользователь $PG_USER создан" || warn "Пользователь $PG_USER уже существует"
  createdb "$PG_DB" -O "$PG_USER" 2>/dev/null && ok "База $PG_DB создана" || warn "База $PG_DB уже существует"
  psql -d postgres -c "ALTER USER ${PG_USER} PASSWORD '${DB_PASSWORD}';" 2>/dev/null || warn "Не удалось установить пароль (возможно peer-auth)"

  if ! psql -U "$PG_USER" -d "$PG_DB" -c "SELECT 1;" &>/dev/null; then
    warn "Подключение с паролем не работает, пробуем peer/trust..."
    DATABASE_URL="postgresql://${PG_USER}@localhost:5432/${PG_DB}"
    if ! psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
      DATABASE_URL="postgres:///vpn_panel"
      warn "Используем unix socket: $DATABASE_URL"
    fi
  fi
else
  sudo -u postgres createuser "$PG_USER" 2>/dev/null && ok "Пользователь $PG_USER создан" || warn "Пользователь $PG_USER уже существует"
  sudo -u postgres createdb "$PG_DB" -O "$PG_USER" 2>/dev/null && ok "База $PG_DB создана" || warn "База $PG_DB уже существует"
  sudo -u postgres psql -c "ALTER USER ${PG_USER} PASSWORD '${DB_PASSWORD}';" 2>/dev/null || warn "Не удалось установить пароль"
fi

ok "PostgreSQL настроен"

ENV_FILE="$INSTALL_DIR/deploy/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENVFILE
DATABASE_URL=${DATABASE_URL}
PORT=${APP_PORT}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
STATIC_DIR=./dist/public
ENVFILE
  ok "Конфигурация сохранена: $ENV_FILE"
else
  ok "Файл .env уже существует, пропускаем"
fi

info "Применение схемы базы данных..."
cd "$INSTALL_DIR/deploy"
set -a; source .env; set +a

npm install --production 2>/dev/null || pnpm install 2>/dev/null || true

npx drizzle-kit push --config ./drizzle.config.ts --force && ok "Схема применена" || {
  warn "drizzle-kit push не удался, повторная попытка..."
  npx drizzle-kit push --config ./drizzle.config.ts --force 2>&1 || warn "Не удалось применить схему — запустите вручную: cd $INSTALL_DIR/deploy && npx drizzle-kit push"
}

cd "$INSTALL_DIR"
cat > "$INSTALL_DIR/start.sh" <<'STARTSH'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/deploy"
set -a; source .env; set +a
echo "Запуск VPN Control Panel на http://localhost:${PORT:-3000}..."
exec node --enable-source-maps dist/index.mjs
STARTSH
chmod +x "$INSTALL_DIR/start.sh"

cat > "$INSTALL_DIR/stop.sh" <<'STOPSH'
#!/usr/bin/env bash
PID=$(pgrep -f "dist/index.mjs" || true)
if [ -n "$PID" ]; then
  kill "$PID"
  echo "VPN Panel остановлен (PID: $PID)"
else
  echo "VPN Panel не запущен"
fi
STOPSH
chmod +x "$INSTALL_DIR/stop.sh"

info "Запуск VPN Control Panel..."
cd "$INSTALL_DIR/deploy"
set -a; source .env; set +a
nohup node --enable-source-maps dist/index.mjs > "$INSTALL_DIR/vpn-panel.log" 2>&1 &
APP_PID=$!

sleep 2
if kill -0 "$APP_PID" 2>/dev/null; then
  ok "VPN Panel запущен (PID: $APP_PID)"
else
  warn "Процесс завершился — проверьте логи: $INSTALL_DIR/vpn-panel.log"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Установка завершена!                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Панель:${NC}     http://localhost:${APP_PORT}"
echo -e "  ${CYAN}Директория:${NC} $INSTALL_DIR"
echo -e "  ${CYAN}Логи:${NC}       $INSTALL_DIR/vpn-panel.log"
echo ""
echo -e "  ${CYAN}Управление:${NC}"
echo "    $INSTALL_DIR/start.sh   — запуск"
echo "    $INSTALL_DIR/stop.sh    — остановка"
echo ""
