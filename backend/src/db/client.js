import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let sqliteDb = null;
let pgPool = null;

function ensureSqlite() {
  if (!sqliteDb) {
    fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
    sqliteDb = new Database(env.dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}

function ensurePgPool() {
  if (!pgPool) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL is required when DB_CLIENT=postgres');
    }
    pgPool = new Pool({
      connectionString: env.databaseUrl
    });
  }
  return pgPool;
}

export const db = env.dbClient === 'postgres' ? null : ensureSqlite();

export async function queryMany(sql, params = []) {
  if (env.dbClient === 'postgres') {
    const pool = ensurePgPool();
    const result = await pool.query(sql, params);
    return result.rows;
  }
  return ensureSqlite().prepare(sql).all(...params);
}

export async function queryOne(sql, params = []) {
  if (env.dbClient === 'postgres') {
    const pool = ensurePgPool();
    const result = await pool.query(sql, params);
    return result.rows[0] ?? null;
  }
  return ensureSqlite().prepare(sql).get(...params) ?? null;
}

export async function execute(sql, params = []) {
  if (env.dbClient === 'postgres') {
    const pool = ensurePgPool();
    const result = await pool.query(sql, params);
    return {
      rowCount: result.rowCount ?? 0,
      rows: result.rows
    };
  }
  const result = ensureSqlite().prepare(sql).run(...params);
  return {
    rowCount: result.changes ?? 0,
    lastInsertRowid: result.lastInsertRowid ?? null
  };
}

export async function withTransaction(callback) {
  if (env.dbClient === 'postgres') {
    const pool = ensurePgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        queryMany: async (sql, params = []) => {
          const result = await client.query(sql, params);
          return result.rows;
        },
        queryOne: async (sql, params = []) => {
          const result = await client.query(sql, params);
          return result.rows[0] ?? null;
        },
        execute: async (sql, params = []) => {
          const result = await client.query(sql, params);
          return {
            rowCount: result.rowCount ?? 0,
            rows: result.rows
          };
        }
      };
      const value = await callback(tx);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const sqlite = ensureSqlite();
  let value;
  const tx = sqlite.transaction(() => {
    value = callback({
      queryMany: async (sql, params = []) => sqlite.prepare(sql).all(...params),
      queryOne: async (sql, params = []) => sqlite.prepare(sql).get(...params) ?? null,
      execute: async (sql, params = []) => {
        const result = sqlite.prepare(sql).run(...params);
        return {
          rowCount: result.changes ?? 0,
          lastInsertRowid: result.lastInsertRowid ?? null
        };
      }
    });
  });
  tx();
  return await value;
}

export async function execSchema(sql) {
  if (env.dbClient === 'postgres') {
    const pool = ensurePgPool();
    await pool.query(sql);
    return;
  }
  ensureSqlite().exec(sql);
}

export async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}
