import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { db } from '../../lib/db.js';
import { sendError, sendSuccess } from '../../lib/api.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { isEmailDeliveryConfigured } from '../../lib/email.js';
import { sendVerificationEmail } from '../auth/auth.controller.js';

const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT id, name, username, email, email_verified AS "emailVerified",
            bio, timezone, role, created_at AS "createdAt"
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [req.user!.id],
  );
  if (!result.rows[0]) {
    return sendError(res, 'USER_NOT_FOUND', 'Profile could not be found.', 404);
  }
  return sendSuccess(res, result.rows[0]);
});

profileRouter.patch('/', async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80),
    username: z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9_]+$/, 'Username can contain only letters, numbers, and underscores.'),
    email: z.email().trim().toLowerCase(),
    currentPassword: z.string().min(8).max(128).optional(),
    bio: z.string().trim().max(280),
    timezone: z.string().trim().min(1).max(80).refine((timezone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, 'Choose a valid timezone.'),
  }).strict().safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Profile data is invalid.', 400);
  }
  const current = await db.query<{ email: string; passwordHash: string }>(
    'SELECT email, password_hash AS "passwordHash" FROM users WHERE id = $1 AND is_active = TRUE',
    [req.user!.id],
  );
  const currentUser = current.rows[0];
  if (!currentUser) {
    return sendError(res, 'USER_NOT_FOUND', 'Profile could not be found.', 404);
  }
  const emailChanged = currentUser.email.toLowerCase() !== parsed.data.email;
  if (emailChanged && (!parsed.data.currentPassword || !await bcrypt.compare(parsed.data.currentPassword, currentUser.passwordHash))) {
    return sendError(res, 'PASSWORD_CONFIRMATION_REQUIRED', 'Enter your current password to change your email address.', 403);
  }
  if (emailChanged) {
    const existingEmail = await db.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1',
      [parsed.data.email, req.user!.id],
    );
    if (existingEmail.rowCount) {
      return sendError(res, 'EMAIL_IN_USE', 'That email address is already in use.', 409);
    }
  }
  let result;
  try {
    result = await db.query(
      `UPDATE users
       SET name = $2, username = $3, email = $4,
           email_verified = CASE WHEN email <> $4 THEN FALSE ELSE email_verified END,
           bio = $5, timezone = $6, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, name, username, email, email_verified AS "emailVerified",
                 bio, timezone, role, created_at AS "createdAt"`,
      [req.user!.id, parsed.data.name, parsed.data.username, parsed.data.email, parsed.data.bio, parsed.data.timezone],
    );
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === '23505'
    ) {
      if ('constraint' in error && error.constraint === 'users_email_key') {
        return sendError(res, 'EMAIL_IN_USE', 'That email address is already in use.', 409);
      }
      return sendError(res, 'USERNAME_IN_USE', 'That username is already taken.', 409);
    }
    throw error;
  }
  if (!result.rows[0]) {
    return sendError(res, 'USER_NOT_FOUND', 'Profile could not be found.', 404);
  }
  let emailVerificationStatus = 'unchanged';
  if (emailChanged) {
    await db.query(`DELETE FROM otp_tokens WHERE user_id = $1 AND purpose = 'EMAIL_VERIFY'`, [req.user!.id]);
    if (!isEmailDeliveryConfigured()) {
      emailVerificationStatus = 'email-provider-not-configured';
    } else {
      try {
        await sendVerificationEmail(req.user!.id, parsed.data.email);
        emailVerificationStatus = 'sent';
      } catch {
        emailVerificationStatus = 'delivery-failed';
      }
    }
  }
  return sendSuccess(res, { ...result.rows[0], emailVerificationStatus });
});

export default profileRouter;
