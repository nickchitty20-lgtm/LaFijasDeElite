import mysql from 'mysql2/promise';

const config = process.env.DATABASE_URL
  ? { uri: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

if (!process.env.DATABASE_URL && (!config.host || !config.user || !config.database)) {
  throw new Error('Configure DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in Railway');
}
export const db = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 10, decimalNumbers: true });
