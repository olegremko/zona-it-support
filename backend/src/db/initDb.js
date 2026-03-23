import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { closeDb, execSchema } from './client.js';

const schemaFile = env.dbClient === 'postgres' ? 'schema.postgres.sql' : 'schema.sql';
const schemaPath = path.resolve(process.cwd(), 'sql', schemaFile);
const sql = fs.readFileSync(schemaPath, 'utf8');

await execSchema(sql);
await closeDb();

console.log(`Database schema initialized for ${env.dbClient}`);
