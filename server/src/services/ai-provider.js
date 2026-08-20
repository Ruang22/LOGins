export class AiProviderError extends Error {}

export function createAiProvider({
  apiKey = process.env.AI_PROVIDER_API_KEY,
  baseUrl = process.env.AI_PROVIDER_BASE_URL,
  model = process.env.AI_PROVIDER_MODEL,
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async parseSchedule(text) {
      if (!apiKey || !baseUrl || !model) {
        throw new AiProviderError('AI provider is not configured.');
      }

      let response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'Return only a JSON object with courseName, startAt (ISO 8601 with offset), and studentNames.',
              },
              { role: 'user', content: text },
            ],
          }),
        });
      } catch {
        throw new AiProviderError('AI provider request failed.');
      }

      if (!response.ok) throw new AiProviderError(`AI provider returned HTTP ${response.status}.`);

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError('AI provider returned an unreadable response.');
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new AiProviderError('AI provider returned no parse result.');
      return content;
    },
  };
}

export function createMockAiProvider(reply) {
  return {
    async parseSchedule() {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}
