import request from 'supertest';
import { createApp } from '../src/app.js';

test('health returns ok', async () => {
  await request(createApp()).get('/health').expect(200, { status: 'ok' });
});
