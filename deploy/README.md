# Развёртывание VPN Control Panel на Raspberry Pi 5

## Требования

- Raspberry Pi 5 с установленной **Raspberry Pi OS 64-bit** (Bookworm или новее)
- Минимум 2 ГБ оперативной памяти
- Доступ к интернету для скачивания образов
- SSH-доступ к Raspberry Pi (или подключённые монитор и клавиатура)
- Компьютер с Node.js 22+ и pnpm для сборки (сборка выполняется на рабочей машине)

## Шаг 1. Сборка на рабочей машине

На компьютере, где установлен Node.js 22+ и pnpm, выполните из корня репозитория:

```bash
pnpm install
pnpm run build:prod
```

Эта команда соберёт фронтенд (Vite) и API-сервер (esbuild) и поместит все необходимые файлы в директорию `deploy/`. После сборки `deploy/` является полностью самодостаточным пакетом — он содержит:

- `dist/` — скомпилированный API-сервер и статические файлы фронтенда
- `db-schema/` — схема базы данных
- `Dockerfile` — многоступенчатая сборка Docker-образа
- `docker-compose.yml` — конфигурация для запуска
- `.env.example` — шаблон переменных окружения
- `entrypoint.sh` — скрипт запуска с автоматическим применением схемы БД

## Шаг 2. Установка Docker на Raspberry Pi

Подключитесь к Raspberry Pi по SSH и выполните:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Выйдите из SSH и подключитесь заново, чтобы применились права группы `docker`.

Проверьте установку:

```bash
docker --version
docker compose version
```

## Шаг 3. Копирование файлов на Pi

Скопируйте содержимое директории `deploy/` на Raspberry Pi:

```bash
rsync -av deploy/ pi@<ip-адрес-pi>:~/vpn-panel/
```

Или с помощью `scp`:

```bash
scp -r deploy/* deploy/.* pi@<ip-адрес-pi>:~/vpn-panel/
```

На Pi нужна только содержимое `deploy/` — остальная часть репозитория не требуется.

## Шаг 4. Настройка переменных окружения

На Raspberry Pi перейдите в директорию с файлами и создайте `.env`:

```bash
cd ~/vpn-panel
cp .env.example .env
nano .env
```

Обязательно измените:

- `POSTGRES_PASSWORD` — надёжный пароль для базы данных (только буквы, цифры и подчёркивания)
- `JWT_SECRET` — длинная случайная строка (можно сгенерировать: `openssl rand -hex 32`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — логин и пароль администратора панели
- `OFFICE_IP`, `OFFICE_PORT`, `OFFICE_SNI`, `OFFICE_PUBLIC_KEY`, `OFFICE_SHORT_ID` — параметры вашего VPN-сервера

**Примечание:** переменная `DATABASE_URL` формируется автоматически из `POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_DB` в docker-compose.yml. Если вы запускаете приложение без Docker Compose, укажите `DATABASE_URL` вручную в `.env`.

## Шаг 5. Запуск

Из директории с файлами выполните:

```bash
docker compose up -d --build
```

Docker соберёт образ приложения (многоступенчатая сборка — установка зависимостей в отдельном слое для оптимизации размера), скачает образ PostgreSQL и запустит оба контейнера.

После успешного запуска панель будет доступна по адресу:

```
http://<ip-адрес-raspberry-pi>:3000
```

IP-адрес можно узнать командой `hostname -I`.

## Управление

### Просмотр логов

```bash
docker compose logs -f app
docker compose logs -f postgres
```

### Остановка

```bash
docker compose down
```

### Перезапуск

```bash
docker compose restart app
```

### Обновление

На рабочей машине пересоберите проект и скопируйте обновлённый `deploy/` на Pi:

```bash
# На рабочей машине (в корне репозитория):
git pull
pnpm run build:prod

# Скопируйте обновлённый deploy/ на Pi:
rsync -av deploy/ pi@<ip-адрес-pi>:~/vpn-panel/

# На Pi:
cd ~/vpn-panel
docker compose up -d --build
```

## Устранение неполадок

### Панель не открывается

1. Проверьте, что контейнеры запущены:
   ```bash
   docker compose ps
   ```
2. Посмотрите логи приложения:
   ```bash
   docker compose logs app
   ```
3. Убедитесь, что порт 3000 не занят другим приложением.

### Ошибка подключения к базе данных

1. Проверьте логи PostgreSQL:
   ```bash
   docker compose logs postgres
   ```
2. Убедитесь, что `POSTGRES_PASSWORD` в `.env` не содержит спецсимволов (`@`, `#`, `%`, `/`).
3. Попробуйте пересоздать тома:
   ```bash
   docker compose down -v
   docker compose up -d --build
   ```
   **Внимание:** флаг `-v` удалит все данные из базы.

### Ошибка применения схемы базы данных

Если в логах видна ошибка `drizzle-kit push`, убедитесь что PostgreSQL полностью запустился. Entrypoint автоматически делает до 10 попыток с интервалом 3 секунды. Если проблема сохраняется:

```bash
docker compose logs postgres
docker compose restart app
```

### Нехватка места на диске

Очистите неиспользуемые Docker-образы:

```bash
docker system prune -a
```
