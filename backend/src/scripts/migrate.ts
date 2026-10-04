import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { pool } from '../lib/db.js';

const runMigrations = async () => {
  if (!pool) {
    throw new Error('DATABASE_URL is required to run database migrations.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDirectory = resolve(process.cwd(), 'database', 'migrations');
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const name of migrationFiles) {
    const existing = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (existing.rowCount) {
      continue;
    }

    const sql = await readFile(resolve(migrationsDirectory, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        name,
      ]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('Database migrations are up to date.');
};

runMigrations()
  .catch((error: unknown) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
