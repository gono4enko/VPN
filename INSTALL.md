# VPN Control Panel — Руководство по установке

## Требования

- **Node.js** 22 или выше
- **PostgreSQL** 14 или выше
- **ОС**: macOS (включая Apple Silicon M4) или Linux (Ubuntu, Debian, и другие)

## Быстрая установка (одна команда)

```bash
curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/install.sh | bash
```

Замените `<user>/<repo>` на реальный путь к репозиторию на GitHub.

Скрипт автоматически:
- Определит вашу ОС и архитектуру
- Скачает правильный архив из GitHub Releases
- Установит приложение
- Настроит базу данных
- Создаст сервис автозапуска

## Ручная установка

### 1. Скачайте архив

Скачайте архив для вашей платформы со страницы [Releases](https://github.com/<user>/<repo>/releases):

- `vpn-panel-*-linux-x86_64.tar.gz` — Linux x86_64
- `vpn-panel-*-linux-arm64.tar.gz` — Linux ARM64
- `vpn-panel-*-darwin-x86_64.tar.gz` — macOS Intel
- `vpn-panel-*-darwin-arm64.tar.gz` — macOS Apple Silicon (M1/M2/M3/M4)

### 2. Распакуйте

```bash
tar -xzf vpn-panel-*.tar.gz
cd vpn-panel-*
```

### 3. Установите зависимости

```bash
npm install --production
```

### 4. Настройте PostgreSQL

```bash
# Создайте пользователя и базу данных
sudo -u postgres createuser vpn_panel
sudo -u postgres createdb vpn_panel -O vpn_panel
sudo -u postgres psql -c "ALTER USER vpn_panel PASSWORD 'ваш_пароль';"
```

### 5. Настройте конфигурацию

```bash
cp .env.example .env
```

Отредактируйте `.env` — укажите пароль PostgreSQL и сгенерируйте JWT-секрет:

```bash
# Генерация случайного JWT-секрета
openssl rand -hex 32
```

### 6. Инициализируйте базу данных

```bash
DATABASE_URL="postgresql://vpn_panel:ваш_пароль@localhost:5432/vpn_panel" npx drizzle-kit push --config db/drizzle.config.ts
```

### 7. Запустите

```bash
./start.sh
```

Панель будет доступна по адресу `http://localhost:3000`

## Управление приложением

| Команда | Описание |
|---------|----------|
| `./start.sh` | Запуск панели |
| `./stop.sh` | Остановка панели |
| `./status.sh` | Проверка статуса |
| `./uninstall.sh` | Удаление панели |

## Настройка автозапуска

### Linux (systemd)

Автоматически настраивается при установке через `install.sh`. Для ручной настройки:

```bash
sudo tee /etc/systemd/system/vpn-panel.service > /dev/null <<EOF
[Unit]
Description=VPN Control Panel
After=network.target postgresql.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/opt/vpn-panel
EnvironmentFile=/opt/vpn-panel/.env
Environment=NODE_ENV=production
Environment=STATIC_DIR=/opt/vpn-panel/public
ExecStart=$(which node) --enable-source-maps /opt/vpn-panel/server/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable vpn-panel
sudo systemctl start vpn-panel
```

### macOS (launchd)

```bash
cat > ~/Library/LaunchAgents/com.vpn-panel.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vpn-panel</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>--enable-source-maps</string>
    <string>$HOME/vpn-panel/server/index.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$HOME/vpn-panel</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/vpn-panel/vpn-panel.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/vpn-panel/vpn-panel-error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.vpn-panel.plist
```

## Решение проблем

### Панель не запускается

1. Проверьте логи: `tail -50 vpn-panel.log`
2. Убедитесь, что PostgreSQL запущен: `sudo systemctl status postgresql`
3. Проверьте подключение к БД: `psql "$DATABASE_URL"`

### Ошибка подключения к базе данных

1. Проверьте, что пользователь и база данных существуют
2. Проверьте правильность `DATABASE_URL` в `.env`
3. Убедитесь, что PostgreSQL принимает подключения по паролю (проверьте `pg_hba.conf`)

### Порт занят

Измените `PORT` в файле `.env` на другой свободный порт.

### Node.js не найден

Установите Node.js 22+:

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (через Homebrew)
brew install node@22
```
