import { readFile } from 'node:fs/promises';
import { db } from './db.js';

export async function initializeDatabase() {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  const connection = await db.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log(`Database schema ready (${statements.length} tables checked)`);
  } finally {
    connection.release();
  }
}
