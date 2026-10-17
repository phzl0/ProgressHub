import React, { useEffect, useRef, useState } from 'react';
import { Award, GitCommitHorizontal, GitPullRequest, CalendarDays, MessageSquareCode, Handshake, ScrollText, Rocket, TrendingUp, ChevronLeft, ChevronRight, Pause, Play, Check, LockKeyhole } from 'lucide-react';
import useCommunityData from './useCommunityData';
const icons = { commits: GitCommitHorizontal, pulls: GitPullRequest, consistency: CalendarDays, reviews: MessageSquareCode, collaboration: Handshake, missions: ScrollText, releases: Rocket, career: TrendingUp };
export function AchievementIcon({ category, size = 23 }) { const Icon = icons[category] || Award; return <Icon size={size} aria-hidden="true" />; }
function AchievementCard({ item }) {
  const value = n => (n || 0).toLocaleString('pt-BR');
  return <article className={`ql-milestone ql-milestone-${item.tone || 'green'} ${item.unlocked ? 'is-unlocked' : ''}`}>
    <div className="ql-milestone-top"><span className="ql-milestone-emblem"><AchievementIcon category={item.category} /></span><span className="ql-milestone-reward">{item.xp > 0 ? `+${value(item.xp)} XP` : 'CONQUISTA'}</span></div>
    <h3>{item.name}</h3><p>{item.description || 'Uma conquista que faz parte da sua história.'}</p>
    <div className="ql-milestone-progress"><span style={{ width: `${item.progress || 0}%` }} /></div>
    <div className="ql-milestone-status">{item.awarded ? <><Check size={13} /> BÔNUS RECEBIDO</> : item.unlocked ? <><Award size={13} /> {item.xp > 0 ? 'BÔNUS NA PRÓXIMA SINCRONIZAÇÃO' : 'CONQUISTA DESBLOQUEADA'}</> : <><LockKeyhole size={12} /> {value(item.current)} / {value(item.target)}</>}</div>
    {!item.unlocked && <small>Faltam {value(Math.max(0, item.target - item.current))} para conquistar.</small>}
  </article>;
}
export default function Achievements({ connected, revision, carousel = false, fallbackNames = [] }) {
  const { data, error } = useCommunityData('/achievements', connected, revision);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [filter, setFilter] = useState('all');
  const track = useRef(null);
  const items = data?.achievements || fallbackNames.map(name => ({ id: name, name, unlocked: true, progress: 100 }));
  const unlocked = items.filter(item => item.unlocked).length;
  const visible = filter === 'earned' ? items.filter(item => item.unlocked) : filter === 'next' ? items.filter(item => !item.unlocked) : items;
  const move = direction => {
    const node = track.current;
    if (!node) return;
    const width = node.clientWidth || 320;
    const end = Math.max(0, node.scrollWidth - width);
    const left = direction > 0 ? (node.scrollLeft >= end - 2 ? 0 : Math.min(end, node.scrollLeft + width + 14))
      : (node.scrollLeft <= 2 ? end : Math.max(0, node.scrollLeft - width - 14));
    if (node.scrollTo) node.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' }); else node.scrollLeft = left;
  };
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduced(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    if (!carousel || paused || hovered || focused || reduced || items.length < 2) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        const node = track.current;
        if (!node) return;
        const width = node.clientWidth || 320;
        const end = Math.max(0, node.scrollWidth - width);
        const left = node.scrollLeft >= end - 2 ? 0 : Math.min(end, node.scrollLeft + width + 14);
        if (node.scrollTo) node.scrollTo({ left, behavior: 'smooth' }); else node.scrollLeft = left;
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [carousel, paused, hovered, focused, reduced, items.length]);
  return <section className="ql-panel ql-milestones" aria-label={carousel ? 'Carrossel de conquistas' : 'Coleção de conquistas'} aria-roledescription={carousel ? 'carrossel' : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="ql-panel-head"><div><p className="ql-eyebrow">CADA MARCO TEM SEU VALOR</p><h2>{carousel ? 'Suas conquistas' : 'Minha coleção de conquistas'}</h2></div><div className="ql-milestone-controls"><span className="ql-tag">{unlocked} / {items.length} CONQUISTAS</span>{carousel && items.length > 0 && <><button className="ql-icon-button" aria-label="Conquistas anteriores" onClick={() => { setPaused(true); move(-1); }}><ChevronLeft size={17} /></button><button className="ql-icon-button" aria-label={paused || reduced ? 'Iniciar carrossel de conquistas' : 'Pausar carrossel de conquistas'} disabled={reduced} onClick={() => setPaused(value => !value)}>{paused || reduced ? <Play size={15} /> : <Pause size={15} />}</button><button className="ql-icon-button" aria-label="Próximas conquistas" onClick={() => { setPaused(true); move(1); }}><ChevronRight size={17} /></button></>}</div></div>
    <p className="ql-caption">Bônus únicos, recebidos automaticamente ao sincronizar. Valem para carreira e temporada. Marcos de dias não exigem sequência. {data?.bonusXP > 0 && <strong>{data.bonusXP.toLocaleString('pt-BR')} XP recebidos em conquistas.</strong>}</p>
    {error && <p role="alert" className="ql-error">{error}</p>}{!connected ? <p className="ql-empty">Entre com GitHub para descobrir suas conquistas e ganhar bônus de XP.</p> : !data && !error ? <p role="status" className="ql-caption">Carregando conquistas…</p> : null}
    {!carousel && items.length > 0 && <div className="ql-milestone-filters" role="group" aria-label="Filtrar conquistas">{[['all', 'Todas'], ['earned', 'Desbloqueadas'], ['next', 'A conquistar']].map(([id, label]) => <button key={id} className="ql-button ql-button-secondary" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>}
    {items.length > 0 && <div ref={track} className={carousel ? 'ql-milestone-track' : 'ql-milestone-grid'} tabIndex={carousel ? 0 : undefined} aria-label={carousel ? 'Conquistas; use as setas ou deslize para navegar' : undefined}>{(carousel ? items : visible).map(item => <AchievementCard key={item.id} item={item} />)}</div>}
    {!carousel && items.length > 0 && !visible.length && <p className="ql-empty">Ainda não há conquistas neste filtro. Continue construindo!</p>}
    {carousel && items.length > 0 && <p className="ql-caption ql-carousel-hint">{reduced ? 'Avanço automático desativado pela sua preferência de movimento.' : paused ? 'Avanço automático pausado.' : 'Avanço automático a cada 6 segundos; pausa ao passar o mouse ou usar o teclado.'} <a href="#me">Ver minha coleção →</a></p>}
  </section>;
}
