// Handle validation + profanity/hate filter for leaderboard names.
// Used on BOTH the client (instant feedback) and the server (real enforcement).
// Philosophy: funny/edgy is fine — we only block slurs, hate, and explicit terms.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 16;

// Allowed raw characters: letters (incl. PT accents), digits, spaces, _ . -
const ALLOWED = /^[\p{L}\p{N} _.\-]+$/u;

// Normalize for matching: lowercase → strip accents → undo common leetspeak → keep only a-z0-9.
// This catches "m3rd@", "f.u.c.k", "c0n4s", etc.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[@4]/g, 'a')
    .replace(/[3€]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

// Curated denylist (normalized forms). Distinctive slurs/hate/explicit only, to avoid blocking
// innocent names. Easy to extend — just add normalized tokens. PT (Portugal) + EN.
const BLOCK = [
  // EN hate slurs / explicit
  'nigger', 'nigga', 'faggot', 'fagot', 'retard', 'tranny', 'kike', 'spic', 'chink', 'coon',
  'cunt', 'whore', 'rape', 'rapist', 'pedo', 'paedo', 'nazi', 'hitler', 'kkk',
  // EN strong profanity
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'cock', 'asshole', 'bastard',
  // PT-PT hate / explicit / strong
  'paneleiro', 'panilas', 'preto de merda', 'mongoloide', 'atrasado mental', 'violador',
  'caralho', 'foda', 'fode', 'fuder', 'puta', 'putedo', 'cona', 'conas', 'piça', 'pixa',
  'merda', 'cabrao', 'cabrona', 'corno', 'badalhoca', 'chupa',
].map(normalize);

export type HandleCheck = { ok: true; value: string } | { ok: false; error: string };

// Re-export the normalizer for message checks below.
export function normalizeText(s: string): string { return normalize(s); }

export const MSG_MAX = 300;

// Only music links are allowed in chat — every other URL is rejected (anti-spam / anti-phishing).
const URL_RE = /https?:\/\/[^\s]+/gi;
const ALLOWED_LINK_DOMAINS = ['youtube.com', 'youtu.be', 'spotify.com', 'soundcloud.com'];
export function isAllowedLink(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return ALLOWED_LINK_DOMAINS.some(b => h === b || h.endsWith('.' + b));
  } catch { return false; }
}

export type MsgCheck = { ok: true; value: string } | { ok: false; error: string };

// Chat message filter: length + slur/hate blocklist + link allowlist.
export function validateMessage(raw: string): MsgCheck {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length < 1) return { ok: false, error: 'Mensagem vazia.' };
  if (value.length > MSG_MAX) return { ok: false, error: `Máximo ${MSG_MAX} caracteres.` };
  const norm = normalize(value);
  if (BLOCK.some(bad => bad && norm.includes(bad))) return { ok: false, error: 'Mensagem bloqueada 🙃' };
  const urls = value.match(URL_RE) || [];
  if (urls.some(u => !isAllowedLink(u))) return { ok: false, error: 'Só links do YouTube, Spotify ou SoundCloud.' };
  return { ok: true, value };
}

export function validateHandle(raw: string): HandleCheck {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < HANDLE_MIN) return { ok: false, error: `Mínimo ${HANDLE_MIN} caracteres.` };
  if (value.length > HANDLE_MAX) return { ok: false, error: `Máximo ${HANDLE_MAX} caracteres.` };
  if (!ALLOWED.test(value)) return { ok: false, error: 'Só letras, números e espaços.' };
  const norm = normalize(value);
  if (BLOCK.some(bad => bad && norm.includes(bad))) return { ok: false, error: 'Escolhe outro nome 🙃' };
  return { ok: true, value };
}
