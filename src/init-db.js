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
    const [userCols]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'");
    if(!userCols.some(c=>c.COLUMN_NAME==='password_hash')) await connection.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
    // Safe, additive migration: preserve all existing customers, payments and VIP periods.
    const accountColumns = {
      account_status: "ENUM('active','blacklisted') NOT NULL DEFAULT 'active'",
      blacklist_reason: 'VARCHAR(350) NULL',
      blacklisted_at: 'DATETIME NULL',
      blacklisted_by: 'BIGINT UNSIGNED NULL'
    };
    for(const [column,definition] of Object.entries(accountColumns)){
      if(!userCols.some(c=>c.COLUMN_NAME===column))
        await connection.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    }

    // Additional fields for manual VIP grants and auditable revocations.
    // Existing memberships default to source=payment; no historical rows are deleted.
    const [membershipCols] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='memberships'");
    const membershipNames = new Set(membershipCols.map(c=>c.COLUMN_NAME));
    const vipColumns = {
      source: "ENUM('payment','manual') NOT NULL DEFAULT 'payment'",
      granted_by: 'BIGINT UNSIGNED NULL',
      grant_reason: 'VARCHAR(350) NULL',
      revoked_at: 'DATETIME NULL',
      revoked_by: 'BIGINT UNSIGNED NULL',
      revoke_reason: 'VARCHAR(350) NULL'
    };
    for (const [column,definition] of Object.entries(vipColumns)) {
      if(!membershipNames.has(column)) await connection.query(`ALTER TABLE memberships ADD COLUMN ${column} ${definition}`);
    }

    // Planes iniciales: se insertan solo cuando no existe otro con el mismo nombre.
    // Nunca se modifican precios ni duraciones configurados por un administrador.
    const starterPlans = [
      ['VIP Semanal', 7, 15],
      ['VIP Mensual', 30, 45],
      ['VIP Trimestral', 90, 120]
    ];
    for (const [name, duration, price] of starterPlans) {
      const [rows] = await connection.execute('SELECT id FROM plans WHERE name = ? LIMIT 1', [name]);
      if (rows.length === 0) {
        await connection.execute('INSERT INTO plans (name, duration_days, price_pen, active) VALUES (?, ?, ?, 1)', [name, duration, price]);
        console.log(`Starter plan created: ${name}`);
      }
    }
    console.log('Customer columns ready');
    console.log('Prediction columns ready');
    console.log(`Database schema ready (${statements.length} tables checked)`);
  } finally {
    connection.release();
  }
}
