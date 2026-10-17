import { readApiResponse } from './apiResponse';
import React, { useEffect, useState } from 'react';
import { Github, ArrowUpRight, ArrowLeft, Trophy, Award, ShieldCheck, Zap, Target } from 'lucide-react';

import { CosmeticAvatar, CosmeticTitle, coverProps } from './Appearance';
import HelpRequests from './HelpRequests';
import ProjectShowcase from './ProjectShowcase';
import ProfileDetails from './ProfileDetails';

const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
export default function PublicProfile({ githubId }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    const controller = new AbortController();
    async function load() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const response = await fetch(`${API}/profiles/${encodeURIComponent(githubId)}`, { signal: controller.signal });
        const data = await readApiResponse(response);
        if (!response.ok) throw new Error(data.error || 'Perfil indisponível.');
        if (mounted) { setProfile(data); setError(''); }
      } catch (err) {
        if (mounted && err.name !== 'AbortError') { setProfile(null); setError(err.message); }
      } finally { inFlight = false; if (mounted) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 600000);
    let lastResume = 0;
    const resume = () => { if (document.visibilityState === 'visible' && Date.now() - lastResume > 10000) { lastResume = Date.now(); load(); } };
    document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [githubId]);
  const cover = coverProps(profile?.appearance, profile?.profile?.banner);
  const stats = profile?.stats;
  const career = profile?.career || stats;
  const progress = Math.min(100, Math.round((career?.experience || 0) / (career?.nextLevelXP || 200) * 100));
  const number = (value) => (value || 0).toLocaleString('pt-BR');
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/community#profile/${githubId}`); setCopied(true); }
    catch (_) { setCopied(false); setError('Copie o endereço do perfil pela barra do navegador.'); }
  }
  if (loading) return <section className="ql-panel" role="status">Carregando perfil público…</section>;
  if (!profile) return <section className="ql-panel ql-empty"><ShieldCheck size={30} /><h2>Perfil indisponível</h2><p>{error || 'Este perfil não foi encontrado ou não participa do ranking público.'}</p><a href="#ranking" className="ql-button ql-button-secondary"><ArrowLeft size={16} /> Voltar ao ranking</a></section>;
  return <div className="ql-public-profile">
    <a href="#ranking" className="ql-back-link"><ArrowLeft size={15} /> Voltar ao ranking</a>
    <section className="ql-panel ql-public-profile-identity-card">
    <div className={`ql-public-cover ${cover.className}`} role="img" aria-label={`Banner de ${profile.login}`} style={cover.style} />
    <div className="ql-public-hero">
      <div className="ql-public-identity"><CosmeticAvatar src={profile.picture} alt={`Avatar de ${profile.login}`} frame={profile.appearance?.frame} size={72} /><div><span className="ql-tag ql-purple-tag"><Award size={12} />{career?.title || 'Explorador'}</span><h2>@{profile.login}</h2><CosmeticTitle title={profile.appearance?.title} /><p className="ql-muted">Desenvolvedor da comunidade · perfil público</p></div></div>
      <div className="ql-public-actions"><a className="ql-button" href={`https://github.com/${profile.login}`} target="_blank" rel="noreferrer"><Github size={16} /> Ver no GitHub <ArrowUpRight size={15} /></a><button className="ql-button ql-button-secondary" onClick={copyLink}>{copied ? 'Link copiado!' : 'Copiar link do perfil'}</button></div>
    </div>
    <ProfileDetails profile={profile.profile} />
    <div className="ql-profile-inline-stats"><PublicMetric icon={Zap} label="XP de carreira" value={number(career?.xp)} tone="green" /><PublicMetric icon={Trophy} label="Posição atual" value={profile.position ? `#${profile.position}` : '—'} tone="gold" /><PublicMetric icon={Award} label="Melhor posição final" value={career?.bestPosition ? `#${career.bestPosition}` : '—'} tone="purple" /><PublicMetric icon={Target} label="XP desta temporada" value={number(stats?.xp)} tone="blue" /></div>
    </section>
    {error && <p className="ql-caption" role="status">{error}</p>}
    {!stats && <p className="ql-update-banner">Aguardando a primeira sincronização deste participante na temporada atual.</p>}

    <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">CARREIRA PERMANENTE</p><h2>{number(career?.xp)} <span className="ql-green">XP conquistados</span></h2></div><span className="ql-tag">{number(stats?.xp)} XP NA TEMPORADA · {stats?.period || new Date().toISOString().slice(0, 7)}</span></div><div className="ql-progress-label"><span>Nível {career?.level || 1}</span><strong>{progress}%</strong><span>Nível {(career?.level || 1) + 1}</span></div><div className="ql-xp-track" role="progressbar" aria-label="Progresso público de nível" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p className="ql-caption">Faltam {number((career?.nextLevelXP || 200) - (career?.experience || 0))} XP para o próximo nível.</p></section>
    <section className="ql-panel"><div className="ql-panel-head"><h2>Conquistas permanentes</h2><span className="ql-tag ql-gold-tag"><Award size={12} />{career?.achievements?.length || 0} DESBLOQUEADAS</span></div>{career?.achievements?.length ? <div className="ql-public-badges ql-compact-badges">{career.achievements.map((badge) => <div key={badge} className="ql-public-badge"><Award size={23} /><strong>{badge}</strong><span>CONQUISTA DESBLOQUEADA</span></div>)}</div> : <p className="ql-empty">As primeiras conquistas ainda estão por vir.</p>}</section>
    <HelpRequests profileId={githubId} />
    <ProjectShowcase projects={profile.profile?.projects} />
    <p className="ql-caption"><ShieldCheck size={13} className="ql-inline-icon" /> Somente o resumo público de quem participa do ranking. Atualização da visualização a cada 10 minutos; atividades são sincronizadas pelo serviço automático quando disponível. {stats?.syncedAt && `GitHub sincronizado em ${new Date(stats.syncedAt).toLocaleString('pt-BR')}.`}</p>
  </div>;
}
function PublicMetric({ icon: Icon, label, value, tone }) {
  return <section className={`ql-profile-stat ql-tone-${tone}`}><span className="ql-metric-icon"><Icon size={19} /></span><p>{label}</p><strong>{value}</strong></section>;
}
