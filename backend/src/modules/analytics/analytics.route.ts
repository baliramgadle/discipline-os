import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.middleware.js';
import { sendSuccess } from '../../lib/api.js';
import { getAnalyticsSummary } from './analytics.service.js';

const analyticsRouter = Router();

analyticsRouter.use(requireAuth);
analyticsRouter.get('/summary', async (req, res) => {
  const summary = await getAnalyticsSummary(req.user!.id);
  return sendSuccess(res, summary);
});

export default analyticsRouter;
