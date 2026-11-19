import { createClient } from '@supabase/supabase-js';
import { pagesPath } from './hosting';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  !pagesPath && url && key ? createClient(url, key) : null;
