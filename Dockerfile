FROM node:22-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend ./
COPY zona-it-main.html /app/zona-it-main.html
COPY zona-it-chat.html /app/zona-it-chat.html
COPY zona-it-portal.html /app/zona-it-portal.html
COPY zona-it-desk.html /app/zona-it-desk.html
COPY _main.js /app/_main.js
COPY _chat.js /app/_chat.js
COPY _portal.js /app/_portal.js
COPY _desk.js /app/_desk.js

EXPOSE 4000

CMD ["node", "src/server.js"]
