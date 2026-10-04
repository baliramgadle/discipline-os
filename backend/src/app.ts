import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
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

app.use(errorHandler);

export default app;