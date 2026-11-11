const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text/attribute content and drop characters XML forbids (URS-RN-001, URS-RN-004). */
export const esc = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"']/g, (c) => ENTITIES[c]!);
