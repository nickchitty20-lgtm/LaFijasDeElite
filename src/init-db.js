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
    const [cols] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='predictions'");
    const existing = new Set(cols.map(c=>c.COLUMN_NAME));
    const additions = {
      league:'VARCHAR(120) NULL', match_date:'DATETIME NULL', market:'VARCHAR(120) NULL',
      selection:'VARCHAR(160) NULL', odds:'DECIMAL(8,2) NULL',
      telegram_status:"ENUM('pending','sent','failed','not_configured') NOT NULL DEFAULT 'pending'"
    };
    for (const [name,definition] of Object.entries(additions)) {
      if (!existing.has(name)) await connection.query(`ALTER TABLE predictions ADD COLUMN ${name} ${definition}`);
    }
    console.log('Prediction columns ready');
    console.log(`Database schema ready (${statements.length} tables checked)`);
  } finally {
    connection.release();
  }
}
