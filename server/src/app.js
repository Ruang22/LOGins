import express from 'express';
import { pathToFileURL } from 'node:url';
import { demoAuth } from './middleware/demo-auth.js';
import { createParentRouter } from './routes/parent-routes.js';
import { createTeacherRouter } from './routes/teacher-routes.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', demoAuth);
  app.use('/api/teacher', createTeacherRouter());
  app.use('/api/parent', createParentRouter());
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Server listening on http://127.0.0.1:${port}`);
  });
}
