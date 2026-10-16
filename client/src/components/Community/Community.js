import React, { useCallback, useEffect, useState } from 'react';
import { Github, Trophy, RefreshCw, GitCommitHorizontal, GitPullRequest, Award, LayoutDashboard, ChartNoAxesCombined, ArrowUpRight, Clock3, ChevronRight, Zap, LogOut, ShieldCheck } from 'lucide-react';
import ProgressChart from './ProgressChart';
import './community.css';
import ScoreDetails from './ScoreDetails';
import PublicProfile from './PublicProfile';

const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
async function request(path, body) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Falha ao acessar a comunidade.');
    error.status = response.status;
    throw error;
  }
  return data;
}
const profileFromHash = () => window.location.hash.match(/^#profile\/(\d{1,20})$/)?.[1] || null;
const oauthErrors = {
  config: 'O login GitHub ainda precisa ser configurado pelo administrador.',
  oauth: 'Não foi possível entrar com GitHub. Tente novamente e confira a configuração do OAuth.'
};
export default function Community() {
  const [profileId, setProfileId] = useState(profileFromHash);
  const [tab, setTab] = useState(() => {
    if (profileFromHash()) return 'profile';
    const value = window.location.hash.slice(1);
    return ['dashboard', 'progress', 'ranking'].includes(value) ? value : 'dashboard';
  });
  const [boardUpdatedAt, setBoardUpdatedAt] = useState(null);
  const [me, setMe] = useState(null);
  const [ranking, setRanking] = useState({ users: [], period: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthErrors[new URLSearchParams(window.location.search).get('error')] || '');
  const loadRanking = useCallback(async () => { setRanking(await request('/leaderboard')); setBoardUpdatedAt(new Date()); }, []);
  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const board = await request('/leaderboard');
        if (mounted) { setRanking(board); setBoardUpdatedAt(new Date()); }
      } catch (err) { if (mounted) setError(err.message); }
      try {
        const user = await request('/me');
        if (mounted) setMe(user);
        // Refresh while visible; no unattended server scheduling yet.
        if (user.connected && (!user.stats || Date.now() - new Date(user.stats.syncedAt).getTime() >= 600000)) {
          try {
            await request('/sync', {});
            const profile = await request('/me');
            const board = await request('/leaderboard');
            if (mounted) { setMe(profile); setRanking(board); setBoardUpdatedAt(new Date()); }
          } catch (err) { if (mounted && err.status !== 429) setError(err.message); }
        }
      } catch (err) {
        if (mounted && err.status === 401) setMe(null);
        else if (mounted) setError(err.message);
      }
      finally { inFlight = false; if (mounted) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 600000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  useEffect(() => {
    const onHash = () => {
      const profile = profileFromHash();
      setProfileId(profile);
      const value = window.location.hash.slice(1);
      if (profile) { setTab('profile'); return; }
      setTab(['dashboard', 'progress', 'ranking'].includes(value) ? value : 'dashboard');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  async function sync() {
    setBusy(true); setError('');
    try {
      await request('/sync', {});
      setMe(await request('/me'));
      await loadRanking();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function participate() {
    setBusy(true); setError('');
    try {
      await request('/participation', { optedIn: !me.optedIn });
      setMe(await request('/me'));
      await loadRanking();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/auth/logout`, { credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível sair.');
      window.location.assign('/community');
    } catch (err) { setError(err.message); setBusy(false); }
  }
  const stats = me?.stats;
  const xp = stats?.xp || 0;
  const level = stats?.level || 1;
  const progress = Math.min(100, Math.round((stats?.experience || 0) / (stats?.nextLevelXP || 200) * 100));
  const position = me?.position;
  const number = (value) => (value || 0).toLocaleString('pt-BR');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'progress', label: 'Progresso', icon: ChartNoAxesCombined },
    { id: 'ranking', label: 'Ranking', icon: Trophy }
  ];
  const achievements = [
    { name: 'Primeiro commit', description: 'Seu primeiro passo na temporada.' },
    { name: 'Primeiro PR mesclado', description: 'Código que passou a fazer parte.' },
    { name: '50 commits no mês', description: 'Consistência em ação.' },
    { name: 'Nível 5', description: 'Um novo patamar desbloqueado.' }
  ];
  const activeDays = stats?.commitDays?.length || 0;
  const subtitle = tab === 'profile' ? 'Conheça quem está construindo junto com você.' : tab === 'ranking' ? 'Encontre seu lugar entre quem constrói.' : tab === 'progress' ? 'Entenda seu ritmo. Evolua a cada contribuição.' : 'Mais uma contribuição. Mais perto do próximo nível.';
  return <div className="ql-game">
    <aside className="ql-sidebar">
      <a href="/community" className="ql-brand"><span className="ql-brand-mark"><Github size={23} /></span><span>QUEST<span className="ql-green">LOG</span><small>DEVELOPER COMMUNITY</small></span></a>
      <p className="ql-nav-label">SEU PRÓXIMO NÍVEL</p>
      <nav aria-label="Navegação principal" className="ql-nav">{tabs.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={tab === id || (tab === 'profile' && id === 'ranking') ? 'page' : undefined} onClick={() => setTab(id)} className={tab === id || (tab === 'profile' && id === 'ranking') ? 'is-active' : ''}><Icon size={19} /><span>{label}</span>{tab === id && <ChevronRight size={15} />}</a>)}</nav>
      <div className="ql-sidebar-bottom"><div className="ql-season-card"><span className="ql-live-dot" /> TEMPORADA ATUAL<strong>{ranking.period || new Date().toISOString().slice(0, 7)}</strong><p>Novas contribuições.<br />Uma nova chance de evoluir.</p><span className="ql-tag">REINÍCIO MENSAL · UTC</span></div><p className="ql-caption">Construído sobre QuestLog · MIT</p></div>
    </aside>
    <div className="ql-workspace">
      <header className="ql-topbar"><span className="ql-breadcrumb">Comunidade <ChevronRight size={13} /> <strong>{tab === 'profile' ? 'Perfil público' : tabs.find((item) => item.id === tab).label}</strong></span><div className="ql-topbar-right"><span className="ql-connected"><span className="ql-live-dot" /> {me?.connected ? 'GITHUB CONECTADO' : 'CONTRIBUA. EVOLUA.'}</span>{me && <button className="ql-icon-button" title="Sair da conta" aria-label="Sair da conta" onClick={logout} disabled={busy}><LogOut size={18} /></button>}</div></header>
      <main className="ql-main" id="community-main">
        <div className="ql-page-heading"><div><p className="ql-eyebrow">{(tab === 'ranking' || tab === 'profile') ? 'ARENA DA COMUNIDADE' : 'SUA JORNADA DE DESENVOLVEDOR'}</p><h1>{tab === 'dashboard' ? <>Vamos construir{me?.login ? `, ${me.login}` : ''}<span className="ql-green">.</span></> : tab === 'progress' ? <>Cada passo é <span className="ql-green">progresso.</span></> : tab === 'profile' ? <>Perfil de <span className="ql-green">desenvolvedor.</span></> : <>Ranking <span className="ql-green">global.</span></>}</h1><p className="ql-muted">{subtitle}</p></div>{!loading && !me?.connected && <a className="ql-button" href={`${API}/auth`}><Github size={18} /> Entrar com GitHub <ArrowUpRight size={16} /></a>}</div>
        <div className="ql-update-banner"><Clock3 size={17} /><div><strong>Pontuação, atividades e ranking atualizados a cada 10 minutos.</strong><span>Enquanto a página estiver visível. {stats ? `Seu GitHub: ${new Date(stats.syncedAt).toLocaleString('pt-BR')}.` : 'Seu XP aparecerá após conectar e sincronizar.'} {boardUpdatedAt ? `Ranking consultado às ${boardUpdatedAt.toLocaleTimeString('pt-BR')}.` : ''}</span></div>{me?.connected && <button className="ql-refresh" disabled={busy || loading} onClick={sync} title="Atualização manual disponível após 30 segundos"><RefreshCw size={16} className={busy ? 'ql-spin' : ''} /><span>{busy ? 'Atualizando' : 'Atualizar agora'}</span></button>}</div>
        {error && <p role="alert" className="ql-error">{error}</p>}
        {loading && <p role="status" className="ql-muted">Carregando sua jornada e contribuições…</p>}
        {me && !me.connected && <p className="ql-muted">Sua sessão atual é do Google. Entre com GitHub para usar o perfil competitivo separado.</p>}
        {tab === 'dashboard' && <>
          <div className="ql-dashboard-top">
            <section className="ql-hero-card"><div className="ql-hero-grid" aria-hidden="true" /><div className="ql-hero-content"><span className="ql-tag ql-purple-tag"><Zap size={12} /> {stats?.title || 'Explorador'}</span><h2>Seu código.<br />Seu próximo nível.</h2><p>Transforme contribuições reais em uma jornada que vale acompanhar.</p><a href="#progress" className="ql-text-link" onClick={() => setTab('progress')}>Explorar meu progresso <ArrowUpRight size={17} /></a></div><div className="ql-level-emblem"><span>LVL</span><strong>{String(level).padStart(2, '0')}</strong><small>{stats?.title || 'EXPLORADOR'}</small></div></section>
            <section className="ql-panel ql-profile-card"><div className="ql-profile-heading">{me?.picture ? <img src={me.picture} alt="" /> : <span className="ql-avatar-placeholder"><Github size={24} /></span>}<div><strong>{me?.login ? `@${me.login}` : 'Seu perfil começa aqui'}</strong><span>{stats?.title || 'Explorador'} · Nível {level}</span></div><ShieldCheck className="ql-green" size={20} /></div><div className="ql-xp-total">{number(xp)} <span>XP</span><small>NA TEMPORADA</small></div><div className="ql-progress-label"><span>Nível {level}</span><strong>{progress}%</strong><span>Nível {level + 1}</span></div><div className="ql-xp-track" role="progressbar" aria-label={`Progresso para o nível ${level + 1}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><p className="ql-caption">Faltam {number((stats?.nextLevelXP || 200) - (stats?.experience || 0))} XP para seu próximo nível.</p>{me?.optedIn && me?.githubId && <a className="ql-own-profile" href={`#profile/${me.githubId}`}>Ver meu perfil público <ArrowUpRight size={13} /></a>}</section>
          </div>
          <div className="ql-metrics"><Metric tone="blue" icon={GitCommitHorizontal} label="Commits pontuados" value={number(stats?.commits)} note="10 XP por commit elegível" /><Metric tone="purple" icon={GitPullRequest} label="PRs mesclados pontuados" value={number(stats?.mergedPRs)} note="50 XP por PR público mesclado" /><Metric icon={Zap} label="Dias com commits" value={number(activeDays)} note="Atividade reconhecida neste mês" /><Metric tone="gold" icon={Trophy} label="Sua posição global" value={position ? `#${position}` : '—'} note={me?.optedIn ? 'Ranking da temporada atual' : 'Participe na aba Ranking'} /></div>
          <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">PEQUENAS VITÓRIAS. GRANDES PASSOS.</p><h2>Suas conquistas</h2></div><span className="ql-tag">{stats?.achievements?.length || 0} / 4 DESBLOQUEADAS</span></div><div className="ql-achievements">{achievements.map((badge, index) => { const unlocked = stats?.achievements?.includes(badge.name); return <div key={badge.name} className={`ql-achievement ${unlocked ? 'is-unlocked' : ''}`}><span className="ql-badge-icon"><Award size={26} /></span><span className="ql-achievement-number">0{index + 1}</span><h3>{badge.name}</h3><p>{badge.description}</p><small>{unlocked ? 'DESBLOQUEADA' : 'A CONQUISTAR'}</small></div>; })}</div></section>
        </>}
        {tab === 'progress' && <>
          <div className="ql-metrics ql-three-metrics"><Metric icon={Zap} label="XP da temporada" value={number(xp)} note="Commits + PRs elegíveis" /><Metric tone="blue" icon={GitCommitHorizontal} label="XP em commits" value={number(stats?.breakdown?.commitXP)} note={`${activeDays} dias com contribuições`} /><Metric tone="purple" icon={GitPullRequest} label="XP em PRs" value={number(stats?.breakdown?.pullRequestXP)} note="Contribuições públicas mescladas" /></div>
          <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">CONSTÂNCIA VIRA EVOLUÇÃO</p><h2>Seu ritmo de contribuição</h2></div><span className="ql-tag"><span className="ql-live-dot" /> XP DIÁRIO DE COMMITS</span></div><ProgressChart stats={stats} /></section>
          {me?.connected ? <ScoreDetails stats={stats} /> : <section className="ql-panel ql-empty"><Github size={30} /><h2>Seu progresso tem um ponto de partida.</h2><p>Entre com GitHub para acompanhar suas atividades e o detalhamento do XP.</p><a href={`${API}/auth`} className="ql-button">Conectar meu GitHub <ArrowUpRight size={16} /></a></section>}
        </>}
        {tab === 'ranking' && <>
          <section className="ql-rank-intro"><div><span className="ql-tag ql-green-tag"><Trophy size={13} /> TEMPORADA {ranking.period}</span><h2>Quem constrói, sobe.</h2><p className="ql-muted">Top 100 da comunidade. Clique em um desenvolvedor para conhecer seu perfil público.</p></div>{me?.connected && <div className="ql-ranking-position"><small>SUA POSIÇÃO</small><strong>{position ? `#${position}` : '—'}</strong><button className="ql-button ql-button-secondary" disabled={busy || loading} onClick={participate}>{me.optedIn ? 'Sair do ranking' : 'Participar do ranking'}<ArrowUpRight size={15} /></button></div>}</section>
          {ranking.users.length > 0 && <div className="ql-podium">{ranking.users.slice(0, 3).map((user, index) => <section key={user.githubId} className={`ql-podium-card ql-podium-${index + 1}`}><span className="ql-podium-place"><Trophy size={17} /> {String(index + 1).padStart(2, '0')}</span><img src={user.picture} alt="" /><a href={`#profile/${user.githubId}`}>@{user.githubLogin}</a><p>{user.githubStats.title} · LVL {user.githubStats.level}</p><strong>{number(user.githubStats.xp)} <small>XP</small></strong></section>)}</div>}
          <section className="ql-panel"><div className="ql-panel-head"><h2>Classificação global</h2><span className="ql-tag">TOP 100 · {ranking.period}</span></div>{!ranking.users.length ? <div className="ql-empty"><Trophy size={36} /><h3>A arena está aberta.</h3><p>Sincronize suas contribuições e participe para iniciar o ranking.</p></div> : <div className="ql-table-scroll"><table className="ql-ranking-table"><caption className="ql-sr-only">Ranking global mensal por XP</caption><thead><tr><th scope="col">Posição</th><th scope="col">Desenvolvedor</th><th scope="col">Nível</th><th scope="col">XP da temporada</th></tr></thead><tbody>{ranking.users.map((user, index) => <tr key={user.githubId} className={user.githubLogin === me?.login ? 'ql-my-row' : ''}><th scope="row">#{String(index + 1).padStart(2, '0')}</th><td><div className="ql-table-profile"><img src={user.picture} alt="" /><div><a href={`#profile/${user.githubId}`}>@{user.githubLogin}{user.githubLogin === me?.login && <span className="ql-you">VOCÊ</span>}</a><small>{user.githubStats.title}</small></div></div></td><td><span className="ql-level-chip">LVL {user.githubStats.level}</span></td><td className="ql-green">{number(user.githubStats.xp)} XP</td></tr>)}</tbody></table></div>}<p className="ql-caption">Participar torna seu resumo de progresso e conquistas públicos. Ao sair, seu perfil fica indisponível para novas consultas. Empates seguem o identificador estável da conta. A posição considera todos os participantes, mesmo fora do Top 100.</p></section>
        </>}
        {tab === 'profile' && profileId && <PublicProfile key={profileId} githubId={profileId} />}
        <details className="ql-rules"><summary><ShieldCheck size={16} /> Regras da temporada e atualização</summary><p>10 XP por commit público reconhecido pelo GitHub, até 20 por dia UTC. 50 XP por PR público mesclado, até 100 por mês. Tarefas manuais não pontuam. Quantidade não mede qualidade técnica.</p><p>XP, níveis e conquistas reiniciam a cada mês UTC. Atualização automática a cada 10 minutos enquanto a página estiver visível, com verificação ao voltar à aba. A atualização manual tem intervalo mínimo de 30 segundos. Com o site fechado, a sincronização fica pausada.</p><p>O GitHub pode demorar para reconhecer contribuições. Importação limitada a menos de 100 repositórios por mês. Alterações nas contribuições reconhecidas podem reduzir a pontuação.</p></details>
        <footer className="ql-footer"><span>QUESTLOG COMMUNITY <span className="ql-green">/</span> EVOLUA CONSTRUINDO.</span><span>Temporada mensal · Contribuições reais</span></footer>
      </main>
    </div>
  </div>;
}
function Metric({ icon: Icon, label, value, note, tone = 'green' }) {
  return <section className={`ql-panel ql-metric ql-tone-${tone}`}><span className="ql-metric-icon"><Icon size={19} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></section>;
}
