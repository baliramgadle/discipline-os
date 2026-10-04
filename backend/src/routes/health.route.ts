import { Router } from 'express';

import { env } from '../config/env.js';
import { sendError, sendSuccess } from '../lib/api.js';
import { checkDatabaseConnection } from '../lib/db.js';

const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const connected = env.DATABASE_URL !== undefined && await checkDatabaseConnection();
  if (!connected) {
    return sendError(res, 'NOT_READY', 'The database is not configured or is unavailable.', 503);
  }
  return sendSuccess(res, {
    status: 'ready',
    service: 'discipline-os-api',
    environment: env.NODE_ENV,
    database: 'connected',
  });
});

healthRouter.get('/live', (_req, res) => {
  return sendSuccess(res, {
    status: 'alive',
    service: 'discipline-os-api',
  });
});

export default healthRouter;