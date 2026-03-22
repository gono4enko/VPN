#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
VERSION="${1:-$(node -p "require('$ROOT_DIR/package.json').version")}"
OS="${2:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${3:-$(uname -m)}"

case "$ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

ARCHIVE_NAME="vpn-panel-${VERSION}-${OS}-${ARCH}"
STAGE_DIR="$RELEASE_DIR/$ARCHIVE_NAME"

echo "=== VPN Control Panel — Release Build ==="
echo "Version: $VERSION"
echo "OS:      $OS"
echo "Arch:    $ARCH"
echo ""

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

echo ">>> Building frontend..."
cd "$ROOT_DIR/artifacts/vpn-panel"
BASE_PATH="/" PORT=3000 npx vite build --config vite.config.ts
echo "Frontend build complete."

echo ">>> Building API server..."
cd "$ROOT_DIR/artifacts/api-server"
node build.mjs
echo "API server build complete."

echo ">>> Assembling release package..."

mkdir -p "$STAGE_DIR/server"
cp -r "$ROOT_DIR/artifacts/api-server/dist/"* "$STAGE_DIR/server/"

mkdir -p "$STAGE_DIR/public"
cp -r "$ROOT_DIR/artifacts/vpn-panel/dist/public/"* "$STAGE_DIR/public/"

mkdir -p "$STAGE_DIR/db"
cp "$ROOT_DIR/lib/db/drizzle.config.ts" "$STAGE_DIR/db/"
cp -r "$ROOT_DIR/lib/db/src" "$STAGE_DIR/db/src"

EXTERNALS=(pino pino-pretty pino-http thread-stream pg)
mkdir -p "$STAGE_DIR/node_modules"
for pkg in "${EXTERNALS[@]}"; do
  PKG_PATH="$ROOT_DIR/node_modules/.pnpm"
  RESOLVED=$(node -e "try { const p = require.resolve('$pkg/package.json', { paths: ['$ROOT_DIR/artifacts/api-server'] }); const path = require('path'); console.log(path.dirname(p)); } catch(e) { console.log(''); }")
  if [ -n "$RESOLVED" ] && [ -d "$RESOLVED" ]; then
    cp -rL "$RESOLVED" "$STAGE_DIR/node_modules/$pkg"
  fi
done

cp "$ROOT_DIR/scripts/release-assets/start.sh" "$STAGE_DIR/start.sh"
cp "$ROOT_DIR/scripts/release-assets/stop.sh" "$STAGE_DIR/stop.sh"
cp "$ROOT_DIR/scripts/release-assets/status.sh" "$STAGE_DIR/status.sh"
cp "$ROOT_DIR/scripts/release-assets/uninstall.sh" "$STAGE_DIR/uninstall.sh"
chmod +x "$STAGE_DIR/"*.sh

cp "$ROOT_DIR/.env.example" "$STAGE_DIR/.env.example"
cp "$ROOT_DIR/INSTALL.md" "$STAGE_DIR/README.md"

cat > "$STAGE_DIR/package.json" <<PKGJSON
{
  "name": "vpn-panel",
  "version": "$VERSION",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --enable-source-maps server/index.mjs",
    "db:push": "npx drizzle-kit push --config db/drizzle.config.ts"
  },
  "dependencies": {
    "pg": "^8.20.0",
    "drizzle-orm": "^0.45.1",
    "drizzle-kit": "^0.31.9",
    "pino": "^9",
    "pino-pretty": "^13",
    "pino-http": "^10",
    "thread-stream": "3.1.0"
  }
}
PKGJSON

echo ">>> Creating archive..."
cd "$RELEASE_DIR"
tar -czf "${ARCHIVE_NAME}.tar.gz" "$ARCHIVE_NAME"

echo ""
echo "=== Release archive created ==="
echo "  $RELEASE_DIR/${ARCHIVE_NAME}.tar.gz"
echo ""
echo "To test locally:"
echo "  cd $STAGE_DIR"
echo "  npm install --production"
echo "  cp .env.example .env  # edit as needed"
echo "  ./start.sh"
