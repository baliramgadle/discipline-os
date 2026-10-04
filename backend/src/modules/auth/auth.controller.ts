import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../lib/api.js';
import { db, pool } from '../../lib/db.js';
import { isEmailDeliveryConfigured, sendEmail } from '../../lib/email.js';
import { env } from '../../config/env.js';
import { createUser, findUserByEmail, findUserById, findUserByLoginIdentifier, findUserByUsername, isRefreshTokenActive, listUsers, revokeRefreshToken, storeRefreshToken } from './auth.repository.js';
import type { AuthTokens } from './auth.types.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../../utils/jwt.js';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9_]+$/, 'Username can contain only letters, numbers, and underscores.'),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include at least one uppercase character.')
    .regex(/[0-9]/, 'Password must include at least one number.'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.email().transform((value) => value.trim().toLowerCase()).optional(),
  password: z.string().min(8).max(128),
}).refine(({ identifier, email }) => Boolean(identifier || email), {
  message: 'Enter your email or username.',
  path: ['identifier'],
}).transform(({ identifier, email, password }) => ({
  identifier: identifier ?? email ?? '',
  password,
}));

const passwordResetRequestSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

const passwordResetSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Password must include at least one uppercase character.')
    .regex(/[0-9]/, 'Password must include at least one number.'),
});

const sanitizeUser = (user: { id: string; email: string; name: string; username: string; role: 'USER' | 'ADMIN' }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  username: user.username,
  role: user.role,
});

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('discipline_os_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('discipline_os_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie('discipline_os_access_token', { path: '/' });
  res.clearCookie('discipline_os_refresh_token', { path: '/' });
};

const createAuthTokens = (user: { id: string; email: string; role: 'USER' | 'ADMIN' }): AuthTokens => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    expiresIn: '900s',
  };
};

export const register = async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Registration payload is invalid.',
      400,
    );
  }

  const { name, username, email, password } = parsed.data;
  if (await findUserByEmail(email)) {
    return sendError(res, 'EMAIL_IN_USE', 'An account with this email already exists.', 409);
  }
  if (await findUserByUsername(username)) {
    return sendError(res, 'USERNAME_IN_USE', 'That username is already taken.', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await createUser({ name, username, email, passwordHash });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      if ('constraint' in error && error.constraint === 'idx_users_username_lower') {
        return sendError(res, 'USERNAME_IN_USE', 'That username is already taken.', 409);
      }
      return sendError(res, 'EMAIL_IN_USE', 'An account with this email already exists.', 409);
    }
    throw error;
  }

  const tokens = createAuthTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  await storeRefreshToken(user.id, tokens.refreshToken);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  let emailVerificationStatus = 'email-provider-not-configured';
  if (isEmailDeliveryConfigured()) {
    try {
      await sendVerificationEmail(user.id, user.email);
      emailVerificationStatus = 'sent';
    } catch {
      emailVerificationStatus = 'delivery-failed';
    }
  }

  return sendSuccess(res, {
    user: sanitizeUser(user),
    tokens,
    emailVerificationStatus,
  });
};

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Login payload is invalid.',
      400,
    );
  }

  const { identifier, password } = parsed.data;
  const user = await findUserByLoginIdentifier(identifier);

  if (!user) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Email, username, or password is incorrect.', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    return sendError(res, 'INVALID_CREDENTIALS', 'Email, username, or password is incorrect.', 401);
  }

  if (!user.isActive) {
    return sendError(res, 'ACCOUNT_DISABLED', 'This account is disabled.', 403);
  }

  const tokens = createAuthTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  await storeRefreshToken(user.id, tokens.refreshToken);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  return sendSuccess(res, {
    user: sanitizeUser(user),
    tokens,
  });
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Enter a valid email address.', 400);
  }
  if (!isEmailDeliveryConfigured()) {
    return sendError(res, 'EMAIL_DELIVERY_UNAVAILABLE', 'Password recovery is unavailable until the email provider is configured.', 503);
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    return sendSuccess(res, {
      message: 'If an active account matches that email, a password reset link will be sent.',
    });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.query(
    `DELETE FROM password_reset_tokens
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id],
  );
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [user.id, tokenHash],
  );

  const resetUrl = new URL('/', env.CLIENT_URL);
  resetUrl.searchParams.set('reset_token', token);
  try {
    await sendEmail(
      user.email,
      'Reset your Discipline OS password',
      `<p>A password reset was requested for your Discipline OS account.</p><p><a href="${resetUrl.toString()}">Reset password</a></p><p>This link expires in one hour. If you did not request it, you can ignore this email.</p>`,
    );
  } catch {
    await db.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    return sendError(res, 'EMAIL_DELIVERY_FAILED', 'The reset email could not be delivered. Try again later.', 503);
  }

  return sendSuccess(res, {
    message: 'If an active account matches that email, a password reset link will be sent.',
  });
};

export const sendVerificationEmail = async (userId: string, email: string) => {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await db.query(
    `DELETE FROM otp_tokens
     WHERE user_id = $1 AND purpose = 'EMAIL_VERIFY'`,
    [userId],
  );
  await db.query(
    `INSERT INTO otp_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'EMAIL_VERIFY', $2, NOW() + INTERVAL '24 hours')`,
    [userId, tokenHash],
  );
  const verificationUrl = new URL('/', env.CLIENT_URL);
  verificationUrl.searchParams.set('verify_token', token);
  try {
    await sendEmail(
      email,
      'Verify your Discipline OS email',
      `<p>Verify the email address for your Discipline OS account by visiting <a href="${verificationUrl.toString()}">this verification link</a>.</p><p>The link expires in 24 hours. If you did not create this account, ignore this email.</p>`,
    );
  } catch (error) {
    await db.query('DELETE FROM otp_tokens WHERE token_hash = $1', [tokenHash]);
    throw error;
  }
};

export const requestEmailVerification = async (req: Request, res: Response) => {
  const user = await findUserById(req.user!.id);
  if (!user || !user.isActive) {
    return sendError(res, 'USER_NOT_FOUND', 'Account could not be found.', 404);
  }
  const verified = await db.query<{ emailVerified: boolean }>(
    'SELECT email_verified AS "emailVerified" FROM users WHERE id = $1',
    [user.id],
  );
  if (verified.rows[0]?.emailVerified) {
    return sendSuccess(res, { message: 'This email address is already verified.' });
  }
  if (!isEmailDeliveryConfigured()) {
    return sendError(res, 'EMAIL_DELIVERY_UNAVAILABLE', 'Email verification is unavailable until the email provider is configured.', 503);
  }
  try {
    await sendVerificationEmail(user.id, user.email);
  } catch {
    return sendError(res, 'EMAIL_DELIVERY_FAILED', 'The verification email could not be delivered. Try again later.', 503);
  }
  return sendSuccess(res, { message: 'A new verification link has been sent. It expires in 24 hours.' });
};

export const confirmEmailVerification = async (req: Request, res: Response) => {
  const parsed = z.object({ token: z.string().min(32).max(256) }).safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', 'The email verification token is invalid.', 400);
  }
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Database access is unavailable.');
  }
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const token = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM otp_tokens
       WHERE purpose = 'EMAIL_VERIFY' AND token_hash = $1
         AND expires_at > NOW() AND attempts < 5
       FOR UPDATE`,
      [tokenHash],
    );
    const userId = token.rows[0]?.userId;
    if (!userId) {
      await client.query('ROLLBACK');
      return sendError(res, 'INVALID_VERIFICATION_TOKEN', 'The verification link is invalid or expired. Request a new link.', 400);
    }
    const updated = await client.query(
      'UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1 AND is_active = TRUE',
      [userId],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return sendError(res, 'INVALID_VERIFICATION_TOKEN', 'The verification link is invalid or expired. Request a new link.', 400);
    }
    await client.query(`DELETE FROM otp_tokens WHERE user_id = $1 AND purpose = 'EMAIL_VERIFY'`, [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return sendSuccess(res, { message: 'Email address verified successfully.' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Password reset data is invalid.',
      400,
    );
  }
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Database access is unavailable.');
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const token = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId"
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash],
    );
    const userId = token.rows[0]?.userId;
    if (!userId) {
      await client.query('ROLLBACK');
      return sendError(res, 'INVALID_RESET_TOKEN', 'The password reset link is invalid or expired.', 400);
    }
    const updated = await client.query(
      'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 AND is_active = TRUE',
      [userId, passwordHash],
    );
    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return sendError(res, 'INVALID_RESET_TOKEN', 'The password reset link is invalid or expired.', 400);
    }
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return sendSuccess(res, { message: 'Password updated. Sign in with your new password.' });
};

export const logout = async (req: Request, res: Response) => {
  const refreshToken =
    typeof req.cookies?.discipline_os_refresh_token === 'string'
      ? req.cookies.discipline_os_refresh_token
      : undefined;

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  clearAuthCookies(res);

  return sendSuccess(res, {
    loggedOut: true,
  });
};

export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
  }

  const user = await findUserById(req.user.id);

  if (!user) {
    return sendError(res, 'USER_NOT_FOUND', 'User could not be found.', 404);
  }

  return sendSuccess(res, {
    user: sanitizeUser(user),
  });
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken =
    (typeof req.body?.refreshToken === 'string' && req.body.refreshToken.trim().length > 0
      ? req.body.refreshToken
      : undefined) ??
    (typeof req.cookies?.discipline_os_refresh_token === 'string'
      ? req.cookies.discipline_os_refresh_token
      : undefined);

  if (!refreshToken) {
    return sendError(res, 'INVALID_REFRESH_TOKEN', 'A refresh token is required.', 401);
  }

  let payload;
  try {
    payload = verifyToken(refreshToken, 'refresh');
  } catch {
    return sendError(res, 'INVALID_REFRESH_TOKEN', 'Authentication token is invalid or expired.', 401);
  }

  const user = await findUserById(payload.sub);
  if (!user || !user.isActive || !(await isRefreshTokenActive(user.id, refreshToken))) {
    return sendError(res, 'INVALID_REFRESH_TOKEN', 'Authentication token is invalid or expired.', 401);
  }

  const tokens = createAuthTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  await revokeRefreshToken(refreshToken);
  await storeRefreshToken(user.id, tokens.refreshToken);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

  return sendSuccess(res, {
    user: sanitizeUser(user),
    tokens,
  });
};

export const adminOverview = async (_req: Request, res: Response) => {
  const users = await listUsers();

  return sendSuccess(res, {
    metrics: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.isActive).length,
      adminUsers: users.filter((user) => user.role === 'ADMIN').length,
    },
    users: users.map((user) => sanitizeUser(user)),
  });
};
