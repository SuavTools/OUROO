'use client';

import React from 'react';
import { isAllowedLink } from '@/lib/names';

const URL_G = /(https?:\/\/[^\s]+)/g;
const isUrl = (s: string) => /^https?:\/\/[^\s]+$/.test(s);

function youtubeId(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}
function spotify(u: string): { type: string; id: string } | null {
  const m = u.match(/open\.spotify\.com\/(track|album|playlist|artist|episode)\/([A-Za-z0-9]+)/);
  return m ? { type: m[1], id: m[2] } : null;
}
function soundcloud(u: string): string | null {
  return /soundcloud\.com\/[\w-]+\/[\w-]+/.test(u) ? u : null;
}

// First recognized media link in the message → an inline player.
function mediaEmbed(text: string): React.ReactNode {
  const urls = text.match(URL_G) || [];
  for (const u of urls) {
    const yt = youtubeId(u);
    if (yt) return (
      <div className="mt-2 w-full max-w-[280px] aspect-video border border-white/10 overflow-hidden">
        <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${yt}`} title="YouTube" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
      </div>
    );
    const sp = spotify(u);
    if (sp) return (
      <iframe className="mt-2 w-full max-w-[300px] border border-white/10" style={{ height: sp.type === 'track' || sp.type === 'episode' ? 80 : 152 }}
        src={`https://open.spotify.com/embed/${sp.type}/${sp.id}?theme=0`} title="Spotify" loading="lazy" allow="encrypted-media" />
    );
    const sc = soundcloud(u);
    if (sc) return (
      <iframe className="mt-2 w-full max-w-[300px] border border-white/10" style={{ height: 120 }} loading="lazy"
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(sc)}&color=%23ff4e3e&visual=false&show_comments=false`} title="SoundCloud" />
    );
  }
  return null;
}

export function MessageBody({ text }: { text: string }) {
  const parts = text.split(URL_G);
  return (
    <>
      <p className="text-sm text-white/90 break-words whitespace-pre-wrap leading-snug">
        {parts.map((p, i) =>
          isUrl(p) && isAllowedLink(p)
            ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-brandRed underline break-all">{p}</a>
            : <React.Fragment key={i}>{p}</React.Fragment>
        )}
      </p>
      {mediaEmbed(text)}
    </>
  );
}
