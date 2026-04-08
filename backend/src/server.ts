import Fastify from 'fastify';
import cors from '@fastify/cors';
import 'dotenv/config';
import { pool } from './db.js';
import { drugRoutes } from './routes/drugs.js';
import { checkRoutes } from './routes/check.js';
import { scheduleSyncJob } from './jobs/sync-dur.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [
    'https://yakcheck.gamja.top',
    'http://localhost:5173',
  ],
});

app.get('/health', async () => {
  const result = await pool.query('SELECT 1');
  return { status: 'ok', db: result.rows.length > 0 };
});

await app.register(drugRoutes);
await app.register(checkRoutes);

const port = parseInt(process.env.PORT || '4301', 10);

try {
  await app.listen({ port, host: '0.0.0.0' });
  scheduleSyncJob();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
