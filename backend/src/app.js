import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { db, execSchema } from './db/client.js';
import { env } from './config/env.js';
import authRoutes from './modules/auth/authRoutes.js';
import companyRoutes from './modules/companies/companyRoutes.js';
import permissionRoutes from './modules/permissions/permissionRoutes.js';
import userRoutes from './modules/users/userRoutes.js';
import ticketRoutes from './modules/tickets/ticketRoutes.js';
import liveChatRoutes from './modules/livechat/liveChatRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export async function createApp() {
  const app = express();
  const siteRoot = path.resolve(process.cwd(), '..');
  const mainPage = path.join(siteRoot, 'zona-it-main.html');
  const portalPage = path.join(siteRoot, 'zona-it-portal.html');
  const chatPage = path.join(siteRoot, 'zona-it-chat.html');
  const schemaFile = env.dbClient === 'postgres' ? 'schema.postgres.sql' : 'schema.sql';
  const schemaPath = path.resolve(process.cwd(), 'sql', schemaFile);

  if (fs.existsSync(schemaPath)) {
    await execSchema(fs.readFileSync(schemaPath, 'utf8'));
  }

  if (env.dbClient !== 'postgres') {
    const companyColumns = db.prepare(`PRAGMA table_info(companies)`).all();
    const ensureCompanyColumn = (name, sql) => {
      if (companyColumns.length && !companyColumns.some((col) => col.name === name)) {
        db.exec(sql);
      }
    };
    ensureCompanyColumn('description', 'ALTER TABLE companies ADD COLUMN description TEXT');
    ensureCompanyColumn('contact_email', 'ALTER TABLE companies ADD COLUMN contact_email TEXT');
    ensureCompanyColumn('contact_phone', 'ALTER TABLE companies ADD COLUMN contact_phone TEXT');
    ensureCompanyColumn('address', 'ALTER TABLE companies ADD COLUMN address TEXT');
    const liveChatColumns = db.prepare(`PRAGMA table_info(live_chat_conversations)`).all();
    if (liveChatColumns.length && !liveChatColumns.some((col) => col.name === 'ticket_id')) {
      db.exec('ALTER TABLE live_chat_conversations ADD COLUMN ticket_id TEXT');
    }
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
  app.disable('x-powered-by');
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
    res.sendFile(mainPage);
  });

  app.get('/portal', (req, res) => {
    res.sendFile(portalPage);
  });

  app.get('/chat', (req, res) => {
    res.sendFile(chatPage);
  });

  app.get('/zona-it-main.html', (req, res) => {
    res.redirect(301, '/');
  });

  app.get('/zona-it-portal.html', (req, res) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const suffix = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    res.redirect(301, `/portal${suffix}`);
  });

  app.get('/zona-it-chat.html', (req, res) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const suffix = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    res.redirect(301, `/chat${suffix}`);
  });

  app.use(express.static(siteRoot));

  app.use(errorHandler);
  return app;
}
