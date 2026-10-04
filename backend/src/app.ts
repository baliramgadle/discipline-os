import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { sendError } from './lib/api.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRouter from './modules/auth/auth.route.js';
import analyticsRouter from './modules/analytics/analytics.route.js';
import dashboardRouter from './modules/dashboard/dashboard.route.js';
import financeRouter from './modules/finance/finance.route.js';
import goalsRouter from './modules/goals/goals.route.js';
import projectsRouter from './modules/projects/projects.route.js';
import reviewsRouter from './modules/reviews/reviews.route.js';
import routinesRouter from './modules/routines/routines.route.js';
import scoresRouter from './modules/scores/scores.route.js';
import tasksRouter from './modules/tasks/tasks.route.js';
import chatRouter from './modules/chat/chat.route.js';
import studyRouter from './modules/study/study.route.js';
import wellnessRouter from './modules/wellness/wellness.route.js';
import leaderboardRouter from './modules/leaderboard/leaderboard.route.js';
import notificationsRouter from './modules/notifications/notifications.route.js';
import profileRouter from './modules/profile/profile.route.js';
import adminRouter from './modules/admin/admin.route.js';
import archiveRouter from './modules/archive/archive.route.js';
import healthRouter from './routes/health.route.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'discipline-os-api',
      message: 'Discipline OS API is running.',
    },
  });
});

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/finance', financeRouter);
app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1/goals', goalsRouter);
app.use('/api/v1/scores', scoresRouter);
app.use('/api/v1/routines', routinesRouter);
app.use('/api/v1/reviews', reviewsRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/study', studyRouter);
app.use('/api/v1/wellness', wellnessRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/archive', archiveRouter);
app.use('/api/v1/admin', adminRouter);

app.use((_req, res) => {
  sendError(res, 'NOT_FOUND', 'The requested route was not found.', 404);
});

app.use(errorHandler);

export default app;