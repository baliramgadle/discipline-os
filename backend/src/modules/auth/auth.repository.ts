import { randomUUID } from 'crypto';

import { db } from '../../lib/db.js';
import type { AuthUser, UserRecord } from './auth.types.js';

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const userColumns = `
  id,
  name,
  username,
  email,
  password_hash AS "passwordHash",
  role,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const findUserByEmail = async (
  email: string,
): Promise<UserRecord | null> => {
  const result = await db.query<UserRecord>(
    `SELECT ${userColumns} FROM users WHERE email = $1 LIMIT 1`,
    [normaliseEmail(email)],
  );

  return result.rows[0] ?? null;
};

export const findUserByLoginIdentifier = async (
  identifier: string,
): Promise<UserRecord | null> => {
  const result = await db.query<UserRecord>(
    `SELECT ${userColumns}
     FROM users
     WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)
     LIMIT 1`,
    [identifier.trim()],
  );

  return result.rows[0] ?? null;
};

export const findUserByUsername = async (username: string): Promise<boolean> => {
  const result = await db.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)) AS exists',
    [username.trim()],
  );
  return result.rows[0]?.exists ?? false;
};

export const findUserById = async (id: string): Promise<UserRecord | null> => {
  const result = await db.query<UserRecord>(
    `SELECT ${userColumns} FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const createUser = async (input: {
  name: string;
  username: string;
  email: string;
  passwordHash: string;
}): Promise<UserRecord> => {
  const id = randomUUID();
  const result = await db.query<UserRecord>(
    `INSERT INTO users (id, name, username, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, 'USER')
     RETURNING ${userColumns}`,
    [id, input.name.trim(), input.username.trim(), normaliseEmail(input.email), input.passwordHash],
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error('Database did not return the created user.');
  }

  return user;
};

export const listUsers = async (): Promise<AuthUser[]> => {
  const result = await db.query<AuthUser>(
    `SELECT id, name, username, email, role,
            is_active AS "isActive",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM users
     ORDER BY created_at DESC`,
  );

  return result.rows;
};

export const storeRefreshToken = async (userId: string, token: string) => {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token, created_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + INTERVAL '7 days')`,
    [userId, token],
  );
};

export const revokeRefreshToken = async (token: string) => {
  await db.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [token],
  );
};

export const isRefreshTokenActive = async (userId: string, token: string) => {
  const result = await db.query<{ active: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM refresh_tokens
       WHERE user_id = $1 AND token = $2 AND expires_at > NOW()
     ) AS active`,
    [userId, token],
  );

  return result.rows[0]?.active ?? false;
};
