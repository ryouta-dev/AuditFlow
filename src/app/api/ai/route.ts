import { createClient } from '@supabase/supabase-js';
import { createAiGateway } from '@/lib/ai/gateway';

export const runtime = 'nodejs';

const handle = createAiGateway({
  async authenticate(token, signal) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) return null;
    const client = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal, cache: 'no-store' }),
      },
    });
    const { data, error } = await client.auth.getUser(token);
    if (signal.aborted) signal.throwIfAborted();
    if (error && (!error.status || error.status >= 500)) throw new Error();
    return data.user?.id ?? null;
  },
});

export async function POST(request: Request) {
  return handle(request);
}
