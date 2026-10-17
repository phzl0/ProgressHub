import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpRight, Rocket, Users, CodeXml } from 'lucide-react';
export const HOME_BANNERS = [
  { id: 'welcome', label: 'PROGRESS HUB', title: 'Seu código abre novos caminhos.', text: 'Construa, colabore e acompanhe sua evolução.', action: 'Ver meu progresso', path: 'progress', icon: Rocket, tone: 'emerald' },
  { id: 'community', label: 'DESAFIO DA COMUNIDADE', title: 'Juntos, cada contribuição vale mais.', text: 'Conheça o desafio coletivo e participe do bolão de XP.', action: 'Explorar missões', path: 'missions', icon: Users, tone: 'violet' },
  { id: 'projects', label: 'COMECE A CONSTRUIR', title: 'Uma ideia. Seu próximo projeto.', text: 'Escolha um roteiro ou crie sua própria meta.', action: 'Escolher uma meta', path: 'goals', icon: CodeXml, tone: 'amber' }
];
export default function HomeBanners({ navigate, autoplay = true }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (!autoplay || hovered || focused || reduced) return;
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') setIndex(value => (value + 1) % HOME_BANNERS.length); }, 3000);
    return () => window.clearInterval(timer);
  }, [autoplay, hovered, focused, reduced, index]);
  const item = HOME_BANNERS[index]; const Icon = item.icon;
  const choose = value => { setIndex((value + HOME_BANNERS.length) % HOME_BANNERS.length); };
  return <section className={`ql-home-banners ql-banner-${item.tone}`} aria-label="Destaques da comunidade" aria-roledescription="carrossel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={event => setFocused(!event.target.closest('.ql-banner-controls'))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="ql-banner-decoration" aria-hidden="true"><Icon size={116} /></div><div className="ql-banner-copy"><p className="ql-eyebrow">{item.label}</p><h2>{item.title}</h2><p>{item.text}</p><a href={`#${item.path}`} onClick={event => navigate(item.path, event)}>{item.action} <ArrowUpRight size={15} /></a></div>
    <div className="ql-banner-controls"><span className="ql-sr-only">Banner {index + 1} de {HOME_BANNERS.length}</span><button className="ql-icon-button" aria-label="Banner anterior" onClick={() => choose(index - 1)}><ChevronLeft size={16} /></button><button className="ql-icon-button" aria-label="Próximo banner" onClick={() => choose(index + 1)}><ChevronRight size={16} /></button></div>
  </section>;
}
