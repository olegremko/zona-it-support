import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { db } from './db/client.js';
import { env } from './config/env.js';
import authRoutes from './modules/auth/authRoutes.js';
import companyRoutes from './modules/companies/companyRoutes.js';
import permissionRoutes from './modules/permissions/permissionRoutes.js';
import userRoutes from './modules/users/userRoutes.js';
import ticketRoutes from './modules/tickets/ticketRoutes.js';
import liveChatRoutes from './modules/livechat/liveChatRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  const siteRoot = path.resolve(process.cwd(), '..');
  const schemaPath = path.resolve(process.cwd(), 'sql', 'schema.sql');

  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }
  const liveChatColumns = db.prepare(`PRAGMA table_info(live_chat_conversations)`).all();
  if (liveChatColumns.length && !liveChatColumns.some((col) => col.name === 'ticket_id')) {
    db.exec('ALTER TABLE live_chat_conversations ADD COLUMN ticket_id TEXT');
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(cors({
    origin(origin, cb) {
      if (!origin || origin === 'null') return cb(null, true);
      if (env.corsOrigin === '*' || origin === env.corsOrigin) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/permissions', permissionRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/live-chat', liveChatRoutes);

  app.get('/', (req, res) => {
    res.redirect('/zona-it-main.html');
  });

  app.use(express.static(siteRoot));

  app.use(errorHandler);
  return app;
}
