import path from 'path';

const cwd = process.cwd();

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbClient: process.env.DB_CLIENT || 'sqlite',
  databaseUrl: process.env.DATABASE_URL || '',
  dbPath: path.resolve(cwd, process.env.DB_PATH || './data/zona-it.db'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  postgresDb: process.env.POSTGRES_DB || 'zona_it',
  postgresUser: process.env.POSTGRES_USER || 'zona_it',
  postgresPassword: process.env.POSTGRES_PASSWORD || '',
  remoteServerHost: process.env.REMOTE_SERVER_HOST || '',
  remoteServerKey: process.env.REMOTE_SERVER_KEY || '',
  remoteDownloadUrl: process.env.REMOTE_DOWNLOAD_URL || 'https://rustdesk.com/'
};
