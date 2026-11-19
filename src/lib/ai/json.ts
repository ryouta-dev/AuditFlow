export class BodyLimit extends Error {}

export async function readJson(
  source: Request | Response,
  limit: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (Number(source.headers.get('content-length') ?? 0) > limit)
    throw new BodyLimit();
  const reader = source.body?.getReader();
  if (!reader) throw new Error();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let text = '';
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new BodyLimit();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    signal.removeEventListener('abort', abort);
    abort();
    reader.releaseLock();
  }
}
