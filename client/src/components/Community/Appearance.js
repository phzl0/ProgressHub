import React, { useSyncExternalStore } from 'react';
import { Github, Zap, Leaf, Compass, Crown } from 'lucide-react';
export const DEFAULT_APPEARANCE = { frame: 'essential', cover: 'custom', title: 'none' };
export const TITLES = { learning: 'Aprendendo em público', building: 'Ideias em código', journey: 'Construindo meu caminho' };
const defaults={frame:'essential',cover:'custom',title:'none',avatar:'github',card:'essential',chat:'standard'};
let clock=Date.now(), timer; const listeners=new Set();
function subscribe(listener){listeners.add(listener);if(!timer)timer=setInterval(()=>{clock=Date.now();listeners.forEach(fn=>fn());},30000);return()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=null;}};}
export function activeAppearance(value={},now=Date.now()){const result={...value};for(const key of Object.keys(defaults))if(result[key]==='energy'&&!(Date.parse(value.expiresAt?.[key])>now))result[key]=defaults[key];return result;}
const idleSubscribe=()=>()=>{};
export function useAppearance(value){const ticking=Object.values(value||{}).includes('energy');const now=useSyncExternalStore(ticking?subscribe:idleSubscribe,()=>clock,()=>clock);return activeAppearance(value,Math.max(now,Date.now()));}
export function ProfileCard({appearance,rank,as:Tag='section',className='',children,...props}){const active=useAppearance(appearance);const skin=['prestige','ember','forest','energy'].includes(active.card)?active.card:'essential';return <Tag {...props} className={`${className} ph-profile-skin ph-skin-${skin}${[1,2,3].includes(rank)?` ph-rank-${rank}`:''}`}>{[1,2,3].includes(rank)&&<span className="ph-rank-crown" aria-label={`Top ${rank} da temporada`}><Crown size={17}/><b>{rank}</b></span>}{children}</Tag>;}
export function CosmeticChatFrame({appearance,as:Tag='li',className='',children,...props}){const active=useAppearance(appearance);const skin=['prestige','ember','forest','energy'].includes(active.chat)?active.chat:'standard';return <Tag {...props} className={`${className} ph-chat-skin-${skin}`}>{children}</Tag>;}
export function CosmeticAvatar({ src, alt = '', frame = 'essential', appearance, size = 72 }) {
  const active=useAppearance(appearance||{frame});frame=active.frame||frame;
  const Symbol={bolt:Zap,leaf:Leaf,compass:Compass}[active.avatar];
  const safeFrame = ['essential', 'circuit', 'terminal', 'crystal', 'prestige', 'ember', 'forest', 'energy'].includes(frame) ? frame : 'essential';
  return <span className={`ql-cosmetic-avatar ql-frame-${safeFrame}`} style={{ '--avatar-size': `${size}px` }}>
    {Symbol ? <span className={`ph-symbol-avatar ph-symbol-${active.avatar}`} role="img" aria-label={alt || 'Avatar simbólico'}><Symbol size={Math.round(size*.48)}/></span> : src ? <img src={src} alt={alt} /> : <span className="ql-cosmetic-placeholder" role="img" aria-label={alt || 'Avatar'}><Github size={Math.round(size * .42)} /></span>}
    <svg className="ql-avatar-ornament" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      {safeFrame === 'ember' && <><path d="M15 72C2 45 13 20 34 10m32 0c21 10 32 35 19 62M29 86l21 10 21-10"/><path d="m42 8 8-6 8 6-8 9Z"/></>}
      {safeFrame === 'forest' && <><path d="M20 82C-4 53 8 19 36 8m28 0c28 11 40 45 16 74"/><path d="m12 30 13-3-6 13Zm76 0-13-3 6 13ZM29 88l21 8 21-8"/></>}
      {safeFrame === 'energy' && <><path d="m18 16 15-7M67 9l15 7 9 17M91 67l-9 17-15 7M33 91l-15-7-9-17M9 33l9-17"/><path d="m46 3-5 12h9l-3 8L61 8H51l5-5Z"/></>}
      {safeFrame === 'circuit'  && <><path d="M12 27V12h16M72 12h16v16M88 73v15H72M28 88H12V72M7 43h8l7-7M93 57h-8l-7 7" /><circle cx="30" cy="12" r="3" /><circle cx="88" cy="30" r="3" /><circle cx="70" cy="88" r="3" /><circle cx="12" cy="70" r="3" /></>}
      {safeFrame === 'terminal' && <><path d="M29 8H8v21M71 8h21v21M92 71v21H71M29 92H8V71" /><path d="m40 88 5-5-5-5m10 10h9" /></>}
      {safeFrame === 'crystal' && <><path d="m50 3 33 14 14 33-14 33-33 14-33-14L3 50l14-33Z" /><path d="m50 3-9 10h18Zm47 47L87 41v18ZM50 97l-9-10h18ZM3 50l10-9v18Z" className="ql-ornament-secondary" /></>}
      {safeFrame === 'prestige' && <><path d="m36 8 14-5 14 5M36 92l14 5 14-5M8 36 3 50l5 14m84-28 5 14-5 14" /><path d="m39 9 4 6 7-8 7 8 4-6M41 91h18" className="ql-ornament-secondary" /><circle cx="16" cy="16" r="3" /><circle cx="84" cy="84" r="3" /></>}
    </svg>
  </span>;
}
export function CosmeticCover({appearance,banner,className='',children,...props}){const active=useAppearance(appearance);const cover=coverProps(active,banner);return <div {...props} className={`${className} ${cover.className}`} style={cover.style}>{children}</div>;}
export function coverProps(appearance, banner) {
  appearance=activeAppearance(appearance); const cover = ['aurora', 'matrix', 'orbit','ember','forest','energy'].includes(appearance?.cover) ? appearance.cover : 'custom';
  return { className: `ql-cover-${cover}${cover === 'custom' && banner ? ' has-banner' : ''}`,
    style: cover === 'custom' && banner ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,.1)),url("${banner}")` } : undefined };
}
Object.assign(TITLES,{prestige:'Forjado no progresso',ember:'Código em chamas',forest:'Raízes de código',energy:'Energia em código'});
export function CosmeticTitle({title,appearance}){const active=useAppearance(appearance||{title});title=active.title||title;return TITLES[title]?<span className={`ql-cosmetic-title ph-title-${title}`}>{TITLES[title]}</span>:null;}

