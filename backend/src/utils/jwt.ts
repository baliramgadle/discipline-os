import jwt, { type JwtPayload } from 'jsonwebtoken';

import { env } from '../config/env.js';
import type { AuthUser, UserRole } from '../modules/auth/auth.types.js';

export type SessionJwtPayload = JwtPayload & {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
};

const getSecret = (tokenType: 'access' | 'refresh') => {
  if (tokenType === 'access') {
    return env.JWT_SECRET;
  }

  return env.JWT_REFRESH_SECRET;
};

export const signAccessToken = (user: Pick<AuthUser, 'id' | 'email' | 'role'>) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    },
    getSecret('access'),
    { expiresIn: '15m' },
  );

export const signRefreshToken = (user: Pick<AuthUser, 'id' | 'email' | 'role'>) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    },
    getSecret('refresh'),
    { expiresIn: '7d' },
  );

export const verifyToken = (token: string, tokenType: 'access' | 'refresh') => {
  const payload = jwt.verify(token, getSecret(tokenType));

  if (typeof payload === 'string') {
    throw new Error('Unexpected token payload type.');
  }

  return payload as SessionJwtPayload;
};
