import { createServer } from 'node:http';

import app from './app.js';
import { env } from './config/env.js';
import { pool } from './lib/db.js';
import { initializeChatSocket } from './modules/chat/chat.socket.js';

const server = createServer(app);
const io = initializeChatSocket(server);

server.listen(env.PORT, () => {
  console.log(`Discipline OS API running at ${env.API_URL}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received. Shutting down server...`);
  io.close(() => {
    console.log('HTTP server closed.');
    void pool?.end().then(() => process.exit(0)).catch((error: unknown) => {
      console.error('Database pool shutdown failed:', error);
      process.exit(1);
    });
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));