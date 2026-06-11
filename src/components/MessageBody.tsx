'use client';

import React from 'react';

// Chat is plain text only — no links, no embeds. URLs are rejected at send time
// (see validateMessage), so anything here renders as inert text.
export function MessageBody({ text }: { text: string }) {
  return (
    <p className="text-sm text-white/90 break-words whitespace-pre-wrap leading-snug">{text}</p>
  );
}
