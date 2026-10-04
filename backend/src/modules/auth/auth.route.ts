import { Router } from 'express';

import { requireAdmin, requireAuth } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/rate-limit.middleware.js';
import { adminOverview, confirmEmailVerification, login, logout, me, refresh, register, requestEmailVerification, requestPasswordReset, resetPassword } from './auth.controller.js';

const authRouter = Router();

authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter, login);
authRouter.post('/refresh', authRateLimiter, refresh);
authRouter.post('/password-reset/request', authRateLimiter, requestPasswordReset);
authRouter.post('/password-reset/confirm', authRateLimiter, resetPassword);
authRouter.post('/email-verification/request', requireAuth, authRateLimiter, requestEmailVerification);
authRouter.post('/email-verification/confirm', authRateLimiter, confirmEmailVerification);
authRouter.post('/logout', requireAuth, logout);
authRouter.get('/me', requireAuth, me);
authRouter.get('/admin/overview', requireAuth, requireAdmin, adminOverview);

export default authRouter;
