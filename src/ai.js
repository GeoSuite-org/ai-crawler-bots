// Optional LLM helper. Off by default, opt-in via env key.
//
// Provider auto-detection: OPENAI_API_KEY > ANTHROPIC_API_KEY. The first
// one present wins. No third-party SDK — we use the native `fetch` so the
// repo stays zero-runtime-dependency.
//
// Privacy: when you call `chat(...)` you're sending the supplied messages
// to the corresponding provider. Don't pass content you wouldn't paste
// into their UI. The README of each tool documents this.
//
// Cost: each provider charges per token. The CLIs that use this helper
// stick to small models (`gpt-5-mini`, `claude-haiku-4-5`) to keep a single
// run under a few cents at typical input sizes.

const PROVIDERS = {
  openai: {
    env: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-5-mini',
  },
  anthropic: {
    env: 'ANTHROPIC_API_KEY',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001',
  },
};

/**
 * @returns {{ name: string, endpoint: string, model: string, key: string } | null}
 */
export function detectProvider() {
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    const key = process.env[cfg.env];
    if (key) return { name, endpoint: cfg.endpoint, model: cfg.model, key };
  }
  return null;
}

/**
 * Send a single chat-completion request to the auto-detected provider.
 * Returns the assistant's text. Throws when no key is configured or the
 * provider returns a non-2xx response.
 *
 * @param {Array<{ role: 'system' | 'user' | 'assistant', content: string }>} messages
 * @param {{ maxTokens?: number, temperature?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function chat(messages, opts = {}) {
  const provider = detectProvider();
  if (!provider) {
    throw new Error(
      'No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable --ai.',
    );
  }
  const maxTokens = opts.maxTokens ?? 600;
  const temperature = opts.temperature ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider.name === 'openai') {
      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature,
          max_completion_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      return String(data.choices?.[0]?.message?.content ?? '').trim();
    }

    if (provider.name === 'anthropic') {
      // Anthropic separates system from messages.
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMessages = messages.filter((m) => m.role !== 'system');
      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': provider.key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model,
          system: system || undefined,
          messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      const blocks = Array.isArray(data.content) ? data.content : [];
      return blocks
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text || ''))
        .join('')
        .trim();
    }

    throw new Error(`Unknown provider: ${provider.name}`);
  } finally {
    clearTimeout(timer);
  }
}

export const _internals = { PROVIDERS };
