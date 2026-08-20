import { Router } from 'express';
import { requireRole } from '../middleware/demo-auth.js';
import { createAiProvider } from '../services/ai-provider.js';
import { parseScheduleRequestSchema, scheduleSchema } from '../schemas/schedule-schema.js';

export function createAiRouter({ aiProvider = createAiProvider() } = {}) {
  const router = Router();
  router.use(requireRole('teacher'));

  router.post('/parse-schedule', async (req, res) => {
    const request = parseScheduleRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ code: 'INVALID_REQUEST' });

    let rawSuggestion;
    try {
      rawSuggestion = await aiProvider.parseSchedule(request.data.text);
    } catch {
      return res.status(503).json({ code: 'AI_PROVIDER_UNAVAILABLE' });
    }

    let parsedSuggestion;
    try {
      parsedSuggestion = JSON.parse(rawSuggestion);
    } catch {
      return res.status(422).json({ code: 'INVALID_AI_OUTPUT' });
    }

    const suggestion = scheduleSchema.safeParse(parsedSuggestion);
    if (!suggestion.success) return res.status(422).json({ code: 'INVALID_AI_OUTPUT' });

    return res.json({ suggestion: suggestion.data });
  });

  return router;
}
