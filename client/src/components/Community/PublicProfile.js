import React, { useEffect, useState } from 'react';
import { Github, ArrowUpRight, ArrowLeft, Trophy, GitCommitHorizontal, GitPullRequest, Award, ShieldCheck } from 'lucide-react';

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
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Perfil indisponível.');
        if (mounted) { setProfile(data); setError(''); }
      } catch (err) {
        if (mounted && err.name !== 'AbortError') { setProfile(null); setError(err.message); }
      } finally { inFlight = false; if (mounted) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 600000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [githubId]);
  const stats = profile?.stats;
  const progress = Math.min(100, Math.round((stats?.experience || 0) / (stats?.nextLevelXP || 200) * 100));
  const number = (value) => (value || 0).toLocaleString('pt-BR');
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/community#profile/${githubId}`); setCopied(true); }
    catch (_) { setCopied(false); setError('Copie o endereço do perfil pela barra do navegador.'); }
  }
  if (loading) return <section className="ql-panel" role="status">Carregando perfil público…</section>;
  if (!profile) return <section className="ql-panel ql-empty"><ShieldCheck size={30} /><h2>Perfil indisponível</h2><p>{error || 'Este perfil não foi encontrado ou não participa do ranking público.'}</p><a href="#ranking" className="ql-button ql-button-secondary"><ArrowLeft size={16} /> Voltar ao ranking</a></section>;
  return <div className="ql-public-profile">
    <a href="#ranking" className="ql-back-link"><ArrowLeft size={15} /> Voltar ao ranking</a>
    <section className="ql-panel ql-public-hero">
      <div className="ql-public-identity"><img src={profile.picture} alt={`Avatar de ${profile.login}`} /><div><span className="ql-tag ql-purple-tag"><Award size={12} />{stats?.title || 'Explorador'}</span><h2>@{profile.login}</h2><p className="ql-muted">Desenvolvedor da comunidade · perfil público</p></div></div>
      <div className="ql-public-actions"><a className="ql-button" href={`https://github.com/${profile.login}`} target="_blank" rel="noreferrer"><Github size={16} /> Ver no GitHub <ArrowUpRight size={15} /></a><button className="ql-button ql-button-secondary" onClick={copyLink}>{copied ? 'Link copiado!' : 'Copiar link do perfil'}</button></div>
    </section>
    {error && <p className="ql-caption" role="status">{error}</p>}
    {!stats && <p className="ql-update-banner">Aguardando a primeira sincronização deste participante na temporada atual.</p>}
    <div className="ql-metrics"><PublicMetric icon={Trophy} label="Posição global" value={profile.position ? `#${profile.position}` : '—'} note="Temporada atual" tone="gold" /><PublicMetric icon={Award} label="Nível da temporada" value={stats?.level || 1} note={stats?.title || 'Explorador'} tone="purple" /><PublicMetric icon={GitCommitHorizontal} label="Commits pontuados" value={number(stats?.commits)} note="Contribuições públicas elegíveis" tone="blue" /><PublicMetric icon={GitPullRequest} label="PRs mesclados pontuados" value={number(stats?.mergedPRs)} note="Contribuições públicas mescladas" tone="green" /></div>
    <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">EVOLUÇÃO DA TEMPORADA</p><h2>{number(stats?.xp)} <span className="ql-green">XP conquistados</span></h2></div><span className="ql-tag">{stats?.period || new Date().toISOString().slice(0, 7)} · UTC</span></div><div className="ql-progress-label"><span>Nível {stats?.level || 1}</span><strong>{progress}%</strong><span>Nível {(stats?.level || 1) + 1}</span></div><div className="ql-xp-track" role="progressbar" aria-label="Progresso público de nível" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><p className="ql-caption">Faltam {number((stats?.nextLevelXP || 200) - (stats?.experience || 0))} XP para o próximo nível.</p></section>
    <section className="ql-panel"><div className="ql-panel-head"><h2>Conquistas da temporada</h2><span className="ql-tag ql-gold-tag"><Award size={12} />{stats?.achievements?.length || 0} DESBLOQUEADAS</span></div>{stats?.achievements?.length ? <div className="ql-public-badges">{stats.achievements.map((badge) => <div key={badge} className="ql-public-badge"><Award size={23} /><strong>{badge}</strong><span>CONQUISTA DESBLOQUEADA</span></div>)}</div> : <p className="ql-empty">As primeiras conquistas ainda estão por vir.</p>}</section>
    <p className="ql-caption"><ShieldCheck size={13} className="ql-inline-icon" /> Somente o resumo público de quem participa do ranking. Atualização da visualização a cada 10 minutos; atividades dependem da sincronização do participante. {stats?.syncedAt && `GitHub sincronizado em ${new Date(stats.syncedAt).toLocaleString('pt-BR')}.`}</p>
  </div>;
}
function PublicMetric({ icon: Icon, label, value, note, tone }) {
  return <section className={`ql-panel ql-metric ql-tone-${tone}`}><span className="ql-metric-icon"><Icon size={19} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></section>;
}
