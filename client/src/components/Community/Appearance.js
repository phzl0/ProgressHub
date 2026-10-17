import React from 'react';
import { Github } from 'lucide-react';
export const DEFAULT_APPEARANCE = { frame: 'essential', cover: 'custom', title: 'none' };
export const TITLES = { learning: 'Aprendendo em público', building: 'Ideias em código', journey: 'Construindo meu caminho' };
export function CosmeticAvatar({ src, alt = '', frame = 'essential', size = 72 }) {
  const safeFrame = ['essential', 'circuit', 'terminal', 'crystal', 'prestige'].includes(frame) ? frame : 'essential';
  return <span className={`ql-cosmetic-avatar ql-frame-${safeFrame}`} style={{ '--avatar-size': `${size}px` }}>
    {src ? <img src={src} alt={alt} /> : <span className="ql-cosmetic-placeholder" role="img" aria-label={alt || 'Avatar'}><Github size={Math.round(size * .42)} /></span>}
    <svg className="ql-avatar-ornament" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      {safeFrame === 'circuit' && <><path d="M12 27V12h16M72 12h16v16M88 73v15H72M28 88H12V72M7 43h8l7-7M93 57h-8l-7 7" /><circle cx="30" cy="12" r="3" /><circle cx="88" cy="30" r="3" /><circle cx="70" cy="88" r="3" /><circle cx="12" cy="70" r="3" /></>}
      {safeFrame === 'terminal' && <><path d="M29 8H8v21M71 8h21v21M92 71v21H71M29 92H8V71" /><path d="m40 88 5-5-5-5m10 10h9" /></>}
      {safeFrame === 'crystal' && <><path d="m50 3 33 14 14 33-14 33-33 14-33-14L3 50l14-33Z" /><path d="m50 3-9 10h18Zm47 47L87 41v18ZM50 97l-9-10h18ZM3 50l10-9v18Z" className="ql-ornament-secondary" /></>}
      {safeFrame === 'prestige' && <><path d="m36 8 14-5 14 5M36 92l14 5 14-5M8 36 3 50l5 14m84-28 5 14-5 14" /><path d="m39 9 4 6 7-8 7 8 4-6M41 91h18" className="ql-ornament-secondary" /><circle cx="16" cy="16" r="3" /><circle cx="84" cy="84" r="3" /></>}
    </svg>
  </span>;
}
export function coverProps(appearance, banner) {
  const cover = ['aurora', 'matrix', 'orbit'].includes(appearance?.cover) ? appearance.cover : 'custom';
  return { className: `ql-cover-${cover}${cover === 'custom' && banner ? ' has-banner' : ''}`,
    style: cover === 'custom' && banner ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,.1)),url("${banner}")` } : undefined };
}
export function CosmeticTitle({ title }) { return TITLES[title] ? <span className="ql-cosmetic-title">{TITLES[title]}</span> : null; }
