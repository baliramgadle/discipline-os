import type { NextFunction, Request, Response } from 'express';

import { sendError } from '../lib/api.js';

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
};

const windowStore = new Map<string, { count: number; resetAt: number }>();

export const createRateLimiter = ({
  windowMs,
  maxRequests,
  keyPrefix = 'rate-limit',
}: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown-ip';

    const key = `${keyPrefix}:${ip}:${req.path}`;
    const now = Date.now();
    const current = windowStore.get(key);

    if (!current || now >= current.resetAt) {
      windowStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= maxRequests) {
      return sendError(
        res,
        'RATE_LIMITED',
        'Too many requests. Please try again later.',
        429,
      );
    }

    current.count += 1;
    return next();
  };
};

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'auth',
});
