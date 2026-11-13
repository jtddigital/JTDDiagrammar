/** Inline stroke icons (24-unit grid, currentColor), so no icon font or package is needed. */
const icon = (d: string) =>
  function Icon() {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    );
  };

export const Sparkle = icon('M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z');
export const Paperclip = icon('M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4L15 7');
export const ArrowUp = icon('M12 19V5M5 12l7-7 7 7');
export const Stop = icon('M7 7h10v10H7z');
export const Undo = icon('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
export const FolderOpen = icon('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19V7Zm0 12 2.6-7.6A2 2 0 0 1 7.5 10H21l-2.6 7.6a2 2 0 0 1-1.9 1.4H3Z');
export const Save = icon('M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3Zm3 0v5h7V3M8 21v-7h8v7');
export const Link = icon('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1');
export const Download = icon('M12 4v11M7 10l5 5 5-5M5 20h14');
export const Close = icon('M6 6l12 12M18 6 6 18');
export const Plus = icon('M12 5v14M5 12h14');
