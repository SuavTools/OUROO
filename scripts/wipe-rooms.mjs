// One-off: clear ALL user-created rooms and ALL placed furniture from Supabase, for the rebuild of
// the room/lore sequence. RLS is permissive (delete using true), so the anon key is enough.
// Run: node scripts/wipe-rooms.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }
const sb = createClient(url, key);

const count = async (t) => { const { count } = await sb.from(t).select('*', { count: 'exact', head: true }); return count ?? 0; };
const ALL = '1900-01-01';   // created_at filter that matches every row

console.log('Before →  rooms:', await count('rooms'), ' room_items:', await count('room_items'));
const r1 = await sb.from('room_items').delete().gt('created_at', ALL);
if (r1.error) console.error('room_items delete error:', r1.error.message);
const r2 = await sb.from('rooms').delete().gt('created_at', ALL);
if (r2.error) console.error('rooms delete error:', r2.error.message);
console.log('After  →  rooms:', await count('rooms'), ' room_items:', await count('room_items'));
