# Developer Handoff

## Repository

- GitHub: [https://github.com/olegremko/zona-it-support](https://github.com/olegremko/zona-it-support)
- Local root: [C:\Users\user\Desktop\codex](C:\Users\user\Desktop\codex)

## Project Structure

- Main website: [zona-it-main.html](C:\Users\user\Desktop\codex\zona-it-main.html)
- Support portal: [zona-it-portal.html](C:\Users\user\Desktop\codex\zona-it-portal.html)
- Legacy chat page: [zona-it-chat.html](C:\Users\user\Desktop\codex\zona-it-chat.html)
- Backend: [backend](C:\Users\user\Desktop\codex\backend)
- Root run guide: [README.md](C:\Users\user\Desktop\codex\README.md)
- Backend architecture notes: [backend-architecture.md](C:\Users\user\Desktop\codex\backend\docs\backend-architecture.md)

## Current Working State

- Site is served by backend at `http://localhost:4000/`
- Static HTML is served by Express from project root
- Guest website chat works from the main site
- Operator portal includes `Чаты сайта`
- First guest question creates both:
  - a live chat conversation
  - a normal support ticket
- Operator can reply in live chat and open the linked ticket
- Admin section exists for:
  - creating users
  - assigning roles
  - editing company role permissions

## Demo Accounts

- Client: `demo@company.ru / demo1234`
- Operator: `agent@zonait.local / demo1234`

## Backend Modules

- Auth: [authRoutes.js](C:\Users\user\Desktop\codex\backend\src\modules\auth\authRoutes.js)
- Tickets: [ticketRoutes.js](C:\Users\user\Desktop\codex\backend\src\modules\tickets\ticketRoutes.js)
- Ticket logic: [ticketService.js](C:\Users\user\Desktop\codex\backend\src\modules\tickets\ticketService.js)
- Live chat: [liveChatRoutes.js](C:\Users\user\Desktop\codex\backend\src\modules\livechat\liveChatRoutes.js)
- Permissions: [permissionService.js](C:\Users\user\Desktop\codex\backend\src\modules\permissions\permissionService.js)
- DB schema: [schema.sql](C:\Users\user\Desktop\codex\backend\sql\schema.sql)

## Important Technical Notes

- The frontend is still plain HTML with large inline scripts.
- Backend serves the HTML directly; there is no separate frontend build step.
- `helmet` CSP is disabled intentionally in [app.js](C:\Users\user\Desktop\codex\backend\src\app.js) because current pages rely on inline JS/CSS.
- Cache is disabled intentionally so office browsers always get fresh HTML/JS.
- Backend auto-applies schema at startup and adds `ticket_id` column to `live_chat_conversations` if missing.
- There are permission fallbacks in [permissionService.js](C:\Users\user\Desktop\codex\backend\src\modules\permissions\permissionService.js) for support roles:
  - `livechat.reply`
  - `ticket.create`
  This was added to support older seeded databases.

## Known Weak Points

- Frontend codebase is still monolithic and hard to maintain.
- Some text in older files may show encoding artifacts in source form, though runtime UI is functional.
- Live chat and ticket synchronization is implemented, but should be covered with real integration tests.
- There is no websocket/realtime layer yet; chat updates are polling-based.
- File attachments are not fully implemented end-to-end on backend.
- Legacy [zona-it-chat.html](C:\Users\user\Desktop\codex\zona-it-chat.html) is no longer the main path and should be reviewed before future reuse.

## Recommended Next Tasks

1. Split large inline frontend logic into maintainable modules or migrate to a framework frontend.
2. Replace polling in live chat with websocket or SSE updates.
3. Add ticket assignment workflow for operators and leads.
4. Add proper company-bound live chat routing if multiple client organizations will use the same platform.
5. Add automated tests for:
   - auth
   - live chat creation
   - ticket auto-creation from chat
   - role/permission management
6. Clean up encoding issues in legacy source files.
7. Add production deployment config:
   - reverse proxy
   - persistent DB backups
   - stronger secrets management

## Run Instructions

### Local Node

```powershell
cd C:\Users\user\Desktop\codex\backend
npm.cmd install
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run dev
```

### Docker

```powershell
cd C:\Users\user\Desktop\codex
docker compose up --build
```

## Handoff Advice

- Start review from [README.md](C:\Users\user\Desktop\codex\README.md)
- Then inspect [liveChatRoutes.js](C:\Users\user\Desktop\codex\backend\src\modules\livechat\liveChatRoutes.js) and [ticketService.js](C:\Users\user\Desktop\codex\backend\src\modules\tickets\ticketService.js)
- For frontend behavior, primary entry points are:
  - [zona-it-main.html](C:\Users\user\Desktop\codex\zona-it-main.html)
  - [zona-it-portal.html](C:\Users\user\Desktop\codex\zona-it-portal.html)
