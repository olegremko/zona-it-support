# Zona IT Support Backend

Каркас backend для портала техподдержки:
- авторизация;
- компании и членство пользователей;
- роли и permissions;
- тикеты и сообщения;
- базовые серверные проверки доступа.

## Стек

- Node.js
- Express
- SQLite (`better-sqlite3`)

## Быстрый старт

1. Установить Node.js 20+.
2. Открыть папку `backend`.
3. Скопировать `.env.example` в `.env` и при необходимости изменить переменные.
4. Выполнить:

```bash
npm install
npm run db:init
npm run db:seed
npm run dev
```

## Демо-доступ

- Клиент: `demo@company.ru` / `demo1234`
- Инженер: `agent@zonait.local` / `demo1234`

## Текущий статус

Каркас API готов, но frontend еще использует локальный `localStorage`.
Следующий шаг: подключить текущие HTML-страницы к `/api/auth` и `/api/tickets`.
