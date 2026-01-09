const OPENAI_API_BASE = 'https://api.openai.com/v1';

type OpenAIJsonSchemaOptions = {
  timeoutMs?: number;
  retries?: number;
  debugLabel?: string;
  maxOutputTokens?: number;
};

function extractOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === 'string') return openaiResponse.output_text;

  const output = openaiResponse?.output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      // Some Responses API payloads provide structured output on `json`.
      if (c && typeof c === 'object' && (c as any).json && typeof (c as any).json === 'object') {
        try {
          return JSON.stringify((c as any).json);
        } catch {
          // ignore and fall back to text extraction
        }
      }
      const t = c?.text;
      if (typeof t === 'string') texts.push(t);
    }
  }
  return texts.join('\n').trim();
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function openaiJsonSchema<T>({
  apiKey,
  model,
  prompt,
  schemaName,
  schema,
  // Some models can take 10s+ even for small JSON outputs; default to 30s.
  timeoutMs = 30_000,
  retries = 2,
  debugLabel,
  maxOutputTokens = 2000,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  schemaName: string;
  schema: any;
} & OpenAIJsonSchemaOptions): Promise<T> {
  const debugEnabled =
    process.env.SENSEMAKING_DEBUG === '1' ||
    process.env.SENSEMAKING_DEBUG === 'true' ||
    process.env.NODE_ENV !== 'production';
  const logPrompts = process.env.SENSEMAKING_LOG_PROMPTS === '1' || process.env.SENSEMAKING_LOG_PROMPTS === 'true';
  const logOutputs = process.env.SENSEMAKING_LOG_OUTPUTS === '1' || process.env.SENSEMAKING_LOG_OUTPUTS === 'true';
  const label = debugLabel || schemaName;

  const maxAttempts = Math.max(1, (Number.isFinite(retries) ? retries : 0) + 1);

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

    const t0 = Date.now();
    if (debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[openai.json_schema.start]', {
        label,
        schemaName,
        model,
        attempt,
        maxAttempts,
        timeoutMs,
        maxOutputTokens,
        promptChars: typeof prompt === 'string' ? prompt.length : null,
        promptPreview: logPrompts && typeof prompt === 'string' ? prompt.slice(0, 800) : undefined,
      });
    }

    try {
      const resp = await fetch(`${OPENAI_API_BASE}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: prompt,
          // Keep outputs small (and avoid timeouts / excessive tokens).
          max_output_tokens: maxOutputTokens,
          text: {
            format: {
              type: 'json_schema',
              name: schemaName,
              strict: true,
              schema,
            },
          },
        }),
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => '');
        const err = new Error(msg || `OpenAI request failed (${resp.status})`);
        (err as any).status = resp.status;

        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[openai.json_schema.http_error]', {
            label,
            schemaName,
            model,
            attempt,
            status: resp.status,
            durationMs: Date.now() - t0,
            bodyPreview: logOutputs ? msg.slice(0, 1200) : undefined,
          });
        }

        // Retry on rate limits / transient server errors.
        if (attempt < maxAttempts && (resp.status === 429 || (resp.status >= 500 && resp.status <= 599))) {
          lastErr = err;
          continue;
        }
        throw err;
      }

      const json = await resp.json();
      const outputText = extractOutputText(json);
      const parsed = safeJsonParse(outputText);
      if (!parsed) {
        const preview = typeof outputText === 'string' ? outputText.slice(0, 500) : '';
        throw new Error(`OpenAI returned non-JSON output${preview ? `: ${preview}` : ''}`);
      }

      if (debugEnabled) {
        // eslint-disable-next-line no-console
        console.log('[openai.json_schema.success]', {
          label,
          schemaName,
          model,
          attempt,
          durationMs: Date.now() - t0,
          outputChars: typeof outputText === 'string' ? outputText.length : null,
          outputPreview: logOutputs && typeof outputText === 'string' ? outputText.slice(0, 1200) : undefined,
        });
      }
      return parsed as T;
    } catch (e) {
      lastErr = e;

      const isAbort = (e as any)?.name === 'AbortError';
      if (attempt < maxAttempts && isAbort) {
        if (debugEnabled) {
          // eslint-disable-next-line no-console
          console.log('[openai.json_schema.retry_abort]', {
            label,
            schemaName,
            model,
            attempt,
            durationMs: Date.now() - t0,
          });
        }
        continue;
      }

      if (isAbort) {
        throw new Error(`OpenAI request timed out after ${Math.max(1, timeoutMs)}ms`);
      }

      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('OpenAI request failed');
}
