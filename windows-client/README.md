# Zona IT Windows Client

Легкая Windows-оболочка над отдельным клиентским интерфейсом тикетов в стиле мессенджера.

## Запуск

```powershell
cd C:\Users\user\Desktop\codex\windows-client
npm install
npm run dev
```

По умолчанию приложение открывает:

- `https://i-zone.pro/desk`

Для staging:

```powershell
$env:ZONA_IT_DESK_URL='https://staging.i-zone.pro/desk'
npm run dev
```
