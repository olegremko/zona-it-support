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

## Сборка `.exe`

```powershell
cd C:\Users\user\Desktop\codex\windows-client
npm install
npm run build-win
```

Готовые файлы появятся в папке `dist`:

- `Zona-IT-Desk-0.1.0-portable.exe`
- `Zona-IT-Desk-0.1.0-setup.exe`
