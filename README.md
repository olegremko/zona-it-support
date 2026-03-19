# Zona IT Support

Проект включает:
- сайт: [zona-it-main.html](/Users/user/Desktop/codex/zona-it-main.html)
- клиентский/операторский портал: [zona-it-portal.html](/Users/user/Desktop/codex/zona-it-portal.html)
- backend API и SQLite: [backend](/Users/user/Desktop/codex/backend)

## Что уже реализовано

- основной сайт открывается по `http://localhost:4000/`
- встроенный гостевой live chat на сайте
- операторский раздел `Чаты сайта`
- автоматическое создание тикета из обращения сайта
- портал поддержки с авторизацией, тикетами, ролями и админ-разделом

## Для разработчика

- основной handoff: [HANDOFF.md](C:\Users\user\Desktop\codex\HANDOFF.md)

## Локальный запуск без Docker

```powershell
cd C:\Users\user\Desktop\codex\backend
npm.cmd install
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run dev
```

После запуска:
- сайт: `http://localhost:4000/`
- портал: `http://localhost:4000/zona-it-portal.html`

Демо-доступ:
- клиент: `demo@company.ru / demo1234`
- оператор: `agent@zonait.local / demo1234`

## Запуск через Docker

```powershell
cd C:\Users\user\Desktop\codex
docker compose up --build
```

После запуска:
- сайт: `http://localhost:4000/`
- портал: `http://localhost:4000/zona-it-portal.html`

Остановка:

```powershell
docker compose down
```

## Что передать разработчику

- весь каталог проекта `codex`
- этот `README`
- доступ к GitHub-репозиторию
- список тестовых учетных данных

## Публикация на GitHub

```powershell
cd C:\Users\user\Desktop\codex
git init
git add .
git commit -m "Initial Zona IT support portal"
git branch -M main
git remote add origin https://github.com/<your-org>/<repo>.git
git push -u origin main
```

## Важно

- файл `backend/.env` не добавляйте в GitHub
- для production лучше заменить `JWT_SECRET`
- база SQLite хранится в `backend/data` локально или в Docker volume `zona_it_data`
