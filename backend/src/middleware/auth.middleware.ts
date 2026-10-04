import type { NextFunction, Request, Response } from 'express';

import { sendError } from '../lib/api.js';
import { findUserById } from '../modules/auth/auth.repository.js';
import { verifyToken } from '../utils/jwt.js';

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const cookieToken =
    typeof req.cookies?.discipline_os_access_token === 'string'
      ? req.cookies.discipline_os_access_token
      : undefined;

  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;

  const token = bearerToken ?? cookieToken;

  if (!token) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
  }

  let payload;
  try {
    payload = verifyToken(token, 'access');
  } catch {
    return sendError(res, 'UNAUTHORIZED', 'Authentication token is invalid or expired.', 401);
  }

  const user = await findUserById(payload.sub);
  if (!user || !user.isActive) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return next();
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return sendError(res, 'FORBIDDEN', 'Administrator access is required.', 403);
  }

  return next();
};
