import path from 'path';

const cwd = process.cwd();

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbPath: path.resolve(cwd, process.env.DB_PATH || './data/zona-it.db'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
};
