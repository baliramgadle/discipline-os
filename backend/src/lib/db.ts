import { Pool } from 'pg';

import { env } from '../config/env.js';

const connectionString = env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: env.NODE_ENV === 'production' ? true : undefined,
      max: env.NODE_ENV === 'production' ? 20 : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;

pool?.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export const checkDatabaseConnection = async (): Promise<boolean> => {
  if (!pool) {
    return false;
  }

  try {
    await pool.query('SELECT 1 as ok');
    return true;
  } catch (error) {
    console.error('Database connectivity check failed:', error);
    return false;
  }
};

export const db = pool ?? {
  async query(_text: string, _params?: unknown[]) {
    throw new Error('DATABASE_URL is not configured. Database access is unavailable.');
  },
};
