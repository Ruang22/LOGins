import express from 'express';
import { pathToFileURL } from 'node:url';

export function createApp() {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Server listening on http://127.0.0.1:${port}`);
  });
}
