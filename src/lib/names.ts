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

// No links in chat — every URL is rejected (anti-spam / anti-phishing, and safer for a young audience).
const URL_RE = /https?:\/\/[^\s]+/gi;

export type MsgCheck = { ok: true; value: string } | { ok: false; error: string };

// Chat message filter: length + no-links rule. Banned words are replaced inline with *Error Code*
// rather than blocking the whole message — the rest of the text sends as-is.
export function validateMessage(raw: string): MsgCheck {
  const value = (raw ?? ‘’).replace(/\s+/g, ‘ ‘).trim();
  if (value.length < 1) return { ok: false, error: ‘Message is empty.’ };
  if (value.length > MSG_MAX) return { ok: false, error: `Max ${MSG_MAX} characters.` };
  if ((value.match(URL_RE) || []).length > 0) return { ok: false, error: ‘Links aren’t allowed in chat.’ };
  const sanitized = value.replace(/\S+/g, word => BLOCK.some(bad => bad && normalize(word).includes(bad)) ? ‘*Error Code*’ : word);
  return { ok: true, value: sanitized };
}

export function validateHandle(raw: string): HandleCheck {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < HANDLE_MIN) return { ok: false, error: `Min ${HANDLE_MIN} characters.` };
  if (value.length > HANDLE_MAX) return { ok: false, error: `Max ${HANDLE_MAX} characters.` };
  if (!ALLOWED.test(value)) return { ok: false, error: 'Letters, numbers and spaces only.' };
  const norm = normalize(value);
  if (BLOCK.some(bad => bad && norm.includes(bad))) return { ok: false, error: 'Pick another name 🙃' };
  return { ok: true, value };
}
