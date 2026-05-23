import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000, 
  idleTimeoutMillis: 30000,
  max: 10 
})

pool.on('error', (err, client) => {
  console.log('❌ Error inesperado en el pool de PostgreSQL:', err);
});

export async function query(sql, params = []) {
  return pool.query(sql, params);
}
