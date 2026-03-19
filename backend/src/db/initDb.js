import fs from 'fs';
import path from 'path';
import { db } from './client.js';

const schemaPath = path.resolve(process.cwd(), 'sql', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

db.exec(sql);
console.log('Database schema initialized');
