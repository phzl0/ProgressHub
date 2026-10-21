import {ChatDockProvider} from './ChatDock';
import Mailbox from './Mailbox';
import XPHistory from './XPHistory';
import AdminPanel from './AdminPanel';
import {SafetyProvider} from './SafetyContext';
import ActionToasts from './ActionToasts';
import { mutationRequest, showFeedback } from './actionFeedback';
import { readApiResponse } from './apiResponse';
import React, { useCallback, useEffect, useState } from 'react';
import { Github, Trophy, GitCommitHorizontal, GitPullRequest, ArrowUpRight, Zap, ShieldCheck } from 'lucide-react';
import ProgressChart from './ProgressChart';
import './community.css';
import './inventory.css';
import './site-layout.css';
import ScoreDetails from './ScoreDetails';
import PublicProfile from './PublicProfile';
import SeasonHistory from './SeasonHistory';
import Missions from './Missions';
import MyProfile from './MyProfile';
import CommunityRanking from './CommunityRanking';
import { CosmeticAvatar, CosmeticTitle } from './Appearance';
import PersonalGoals from './PersonalGoals';
import WeeklySummary from './WeeklySummary';
import CareerTop from './CareerTop';
import Achievements from './Achievements';
import {FirstSteps} from './CommunityDiscovery';
import './community-growth.css';
import CommunityHeader from './CommunityHeader';
import HomeBanners from './HomeBanners';
import RankingPodium from './RankingPodium';
import CommunitySocial from './CommunitySocial';
import AccountPages from './AccountPages';
import { viewFromHash, PAGE_LABELS, parentView } from './navigation';
import CommunityFooter from './CommunityFooter';

const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
async function request(path, body) {
  if(body!==undefined)return mutationRequest(`${API}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},{path});
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  const data = await readApiResponse(response);
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
  const [tab, setTab] = useState(() => viewFromHash());
  const [bannerAutoplay, setBannerAutoplay] = useState(() => { try { return localStorage.getItem('ph-banner-autoplay') !== 'false'; } catch (_) { return true; } });
  function changeBannerAutoplay(value) { setBannerAutoplay(value); try { localStorage.setItem('ph-banner-autoplay', String(value)); showFeedback('Preferência de animação salva.'); } catch (_) { showFeedback('Preferência aplicada nesta sessão.'); } }
  function navigate(path, event) {
    if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0)) return;
    event?.preventDefault();
    window.location.hash = path;
    setTab(viewFromHash(path));
    setProfileId(path.match(/^profile\/(\d{1,20})$/)?.[1] || null);
    if (path === 'ranking/community') setRankKind('community');
    else if (path === 'ranking') setRankKind('global');
  }
  const [me, setMe] = useState(null);
  const [rankKind, setRankKind] = useState(() => window.location.hash === '#ranking/community' ? 'community' : 'global');
  const [ranking, setRanking] = useState({ users: [], period: '' });
  const [loading, setLoading] = useState(true);
  const [syncWarning, setSyncWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthErrors[new URLSearchParams(window.location.search).get('error')] || '');
  const loadRanking = useCallback(async () => { setRanking(await request('/leaderboard'));  }, []);
  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      let workerActive = false;
      try {
        const status = await request('/sync-status');
        workerActive = Boolean(status.active);
      } catch (_) { /* The visible page remains a synchronization fallback. */ }
      try {
        const board = await request('/leaderboard');
        if (mounted) { setRanking(board);  }
      } catch (err) { if (mounted) setError(err.message); }
      try {
        const user = await request('/me');
        if (mounted) { setMe(user); setSyncWarning(user.backgroundSyncError || ''); setError(previous => previous.startsWith('Muitas consultas') ? '' : previous); }
        // Refresh while visible; no unattended server scheduling yet.
        if (!workerActive && user.connected && (!user.stats || Date.now() - new Date(user.stats.syncedAt).getTime() >= 600000)) {
          try {
            await request('/sync', {});
            const profile = await request('/me');
            const board = await request('/leaderboard');
            if (mounted) { setMe(profile); setRanking(board); setSyncWarning(profile.backgroundSyncError || ''); }
          } catch (err) { if (mounted && err.status !== 429) setSyncWarning(err.message); }
        }
      } catch (err) {
        if (mounted && err.status === 401) setMe(null);
        else if (mounted) setError(err.message);
      }
      finally { inFlight = false; if (mounted) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 600000);
    let lastResume = 0;
    const resume = () => { if (document.visibilityState === 'visible' && Date.now() - lastResume > 10000) { lastResume = Date.now(); load(); } };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  useEffect(() => {
    const onHash = () => {
      setProfileId(profileFromHash());
      setTab(viewFromHash());
      if (window.location.hash === '#ranking/community') setRankKind('community');
      else if (window.location.hash === '#ranking') setRankKind('global');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(()=>{
    if(!me?.connected)return;let active=true;let timer;let version=0;
    const changed=event=>{if(!event.detail?.domains?.includes('me'))return;const mine=++version;window.clearTimeout(timer);timer=window.setTimeout(async()=>{const result=await Promise.allSettled([request('/me'),request('/leaderboard')]);if(!active||mine!==version)return;if(result[0].status==='fulfilled')setMe(result[0].value);if(result[1].status==='fulfilled')setRanking(result[1].value);},100);};
    window.addEventListener('ph-data-changed',changed);return()=>{active=false;window.clearTimeout(timer);window.removeEventListener('ph-data-changed',changed);};
  },[me?.connected]);
  async function sync() {
    setBusy(true); setError('');
    try {
      await request('/sync', {});
      setMe(await request('/me'));
      await loadRanking();
      setSyncWarning('');
    } catch (err) { setSyncWarning(err.message); }
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
    if(busy)return;
    showFeedback('Encerrando sessão…','pending',{id:'logout'});
    setBusy(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/auth/logout`, { credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível sair.');
      showFeedback('Sessão encerrada.','success',{id:'logout'});
      window.location.assign('/community');
    } catch (err) { showFeedback(err.message,'error',{id:'logout'}); setError(err.message); setBusy(false); }
  }
  const stats = me?.stats;
  const xp = stats?.xp || 0;
  const career = me?.career || stats;
  const level = career?.level || 1;
  const progress = Math.min(100, Math.round((career?.experience || 0) / (career?.nextLevelXP || 200) * 100));
  const position = me?.position;
  const number = (value) => (value || 0).toLocaleString('pt-BR');
  const activeDays = stats?.commitDays?.length || 0;
  const subtitle = tab === 'achievements' ? 'Marcos permanentes. Cada conquista tem seu valor.' : tab === 'settings' ? 'A experiência do seu jeito.' : tab === 'account' ? 'Sua identidade conectada pelo GitHub.' : tab === 'privacy' ? 'Você escolhe como participa da comunidade.' : tab === 'information' ? 'Conheça os critérios e tire suas dúvidas.' : tab === 'goals' ? 'Projetos para construir. Metas no seu ritmo.' : tab === 'missions' ? 'Objetivos simples. Bônus que aceleram sua evolução.' : tab === 'me' ? 'Seu lugar na comunidade. Sua história de evolução.' : tab === 'seasons' ? 'Novas disputas. Uma carreira que continua.' : tab === 'profile' ? 'Conheça quem está construindo junto com você.' : tab === 'ranking' ? 'Encontre seu lugar entre quem constrói.' : tab === 'progress' ? 'Entenda seu ritmo. Evolua a cada contribuição.' : 'Mais uma contribuição. Mais perto do próximo nível.';
  const group = parentView(tab);
  const showIntroduction = !['dashboard', 'ranking', 'missions', 'progress', 'goals', 'profile', 'me', 'community', 'seasons','mail'].includes(tab);
  if(tab==='admin')return <div className="ql-game ql-site-shell"><ActionToasts/><AdminPanel connected={me?.connected}/></div>;
  return <SafetyProvider connected={me?.connected} viewerId={me?.githubId}><ChatDockProvider key={me?.githubId||'guest'} connected={me?.connected} ready={Boolean(me)}><div className="ql-game ql-site-shell"><ActionToasts />
    <a className="ql-skip-link" href="#community-main" onClick={event => { event.preventDefault(); document.getElementById('community-main')?.focus(); }}>Ir para o conteúdo</a>
    <CommunityHeader onAppearanceSaved={appearance => {setMe(current=>({...current,appearance}));setRanking(current=>({...current,users:current.users.map(user=>user.githubId===me.githubId?{...user,appearance}:user)}));}} tab={tab} navigate={navigate} me={me} sync={sync} logout={logout} busy={busy} loading={loading} syncWarning={syncWarning || me?.backgroundSyncError} />
    <div className="ql-site-body">
      <main className="ql-main" id="community-main" tabIndex={-1}>
        {showIntroduction && <div className="ql-page-heading"><div><p className="ql-eyebrow">{(group === 'ranking' || tab === 'profile') ? 'ARENA DA COMUNIDADE' : 'SUA JORNADA DE DESENVOLVEDOR'}</p><h1>{PAGE_LABELS[tab] || 'Tela inicial'}<span className="ql-green">.</span></h1><p className="ql-muted">{subtitle}</p></div>{!loading && !me?.connected && <a className="ql-button" href={`${API}/auth`}><Github size={18} /> Entrar com GitHub <ArrowUpRight size={16} /></a>}</div>}
        {group === 'ranking' && <nav className="ql-section-navigation" aria-label="Navegação do ranking"><a href="#ranking" aria-current={tab === 'ranking' ? 'page' : undefined} onClick={event => navigate('ranking', event)}>Classificação</a><a href="#ranking/seasons" aria-current={tab === 'seasons' ? 'page' : undefined} onClick={event => navigate('ranking/seasons', event)}>Temporadas</a></nav>}
        {group === 'progress' && <nav className="ql-section-navigation" aria-label="Navegação do progresso"><a href="#progress" aria-current={tab === 'progress' ? 'page' : undefined} onClick={event => navigate('progress', event)}>Visão geral</a><a href="#progress/achievements" aria-current={tab === 'achievements' ? 'page' : undefined} onClick={event => navigate('progress/achievements', event)}>Conquistas</a></nav>}

        {me?.suspension&&<p role="status" className="ph-admin-warning">Sua participação está suspensa até {new Date(me.suspension.until).toLocaleString('pt-BR')}. {me.suspension.reason} Você pode consultar o site e usar a Central de segurança.</p>}
        {error && <p role="alert" className="ql-error">{error}</p>}
        {loading && <p role="status" className="ql-muted">Carregando sua jornada e contribuições…</p>}
        {tab === 'dashboard' && <>
          <FirstSteps key={me?.githubId||'guest'} connected={Boolean(me?.connected)}/>
          <div className="ql-dashboard-top">
            <HomeBanners navigate={navigate} autoplay={bannerAutoplay} />
            <section className="ql-panel ql-profile-card"><div className="ql-profile-heading">{me?.picture ? <CosmeticAvatar src={me.picture} appearance={me.appearance} frame={me.appearance?.frame} size={44} /> : <span className="ql-avatar-placeholder"><Github size={24} /></span>}<div><strong>{me?.login ? `@${me.login}` : 'Seu perfil começa aqui'}</strong><span>{career?.title || 'Explorador'} · Nível {level}</span></div><ShieldCheck className="ql-green" size={20} /></div><div className="ql-xp-total">{number(career?.xp)} <span>XP</span><small>CARREIRA PERMANENTE</small></div><div className="ql-progress-label"><span>Nível {level}</span><strong>{progress}%</strong><span>Nível {level + 1}</span></div><div className="ql-xp-track" role="progressbar" aria-label={`Progresso para o nível ${level + 1}`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><p className="ql-caption">Faltam {number((career?.nextLevelXP || 200) - (career?.experience || 0))} XP para seu próximo nível.</p>{me?.optedIn && me?.githubId && <a className="ql-own-profile" href={`#profile/${me.githubId}`}>Ver meu perfil público <ArrowUpRight size={13} /></a>}</section>
          </div>
          <div className="ql-metrics"><Metric tone="blue" icon={GitCommitHorizontal} label="Commits pontuados" value={number(stats?.commits)} note="10 XP por commit elegível" /><Metric tone="purple" icon={GitPullRequest} label="PRs mesclados pontuados" value={number(stats?.mergedPRs)} note="50 XP por PR + bônus de colaboração" /><Metric icon={Zap} label="Dias com commits" value={number(activeDays)} note="Atividade reconhecida neste mês" /><Metric tone="gold" icon={Trophy} label="Sua posição global" value={position ? `#${position}` : '—'} note={me?.optedIn ? 'Ranking da temporada atual' : 'Participe na aba Ranking'} /></div>
          <CareerTop revision={`${stats?.syncedAt}:${stats?.xp}:${me?.optedIn}:${me?.appearance?.frame}`} login={me?.login} />
        </>}
        {tab === 'achievements' && <Achievements connected={me?.connected} revision={`${stats?.syncedAt}:${stats?.xp}`} fallbackNames={career?.achievements} />}
        {['settings', 'account', 'privacy', 'information'].includes(tab) && <AccountPages tab={tab} me={me} autoplay={bannerAutoplay} onAutoplayChange={changeBannerAutoplay} participate={participate} busy={busy} api={API} />}
        {tab==='mail'&&<Mailbox connected={me?.connected}/>}
        {tab === 'progress' && <>
          <WeeklySummary connected={me?.connected} revision={`${stats?.syncedAt}:${stats?.missionXP}`} />
          <div className="ql-metrics ql-three-metrics"><Metric icon={Zap} label="XP da temporada" value={number(xp)} note="Commits + PRs elegíveis" /><Metric tone="blue" icon={GitCommitHorizontal} label="XP em commits" value={number(stats?.breakdown?.commitXP)} note={`${activeDays} dias com contribuições`} /><Metric tone="purple" icon={GitPullRequest} label="XP em PRs" value={number(stats?.breakdown?.pullRequestXP)} note="Contribuições públicas mescladas" /></div>
          <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">CONSTÂNCIA VIRA EVOLUÇÃO</p><h2>Seu ritmo de contribuição</h2></div><span className="ql-tag"><span className="ql-live-dot" /> XP DIÁRIO DE COMMITS</span></div><ProgressChart stats={stats} /></section>
          {me?.connected&&<XPHistory revision={`${stats?.syncedAt}:${stats?.xp}`} />}
          {me?.connected ? <ScoreDetails stats={stats} /> : <section className="ql-panel ql-empty"><Github size={30} /><h2>Seu progresso tem um ponto de partida.</h2><p>Entre com GitHub para acompanhar suas atividades e o detalhamento do XP.</p><a href={`${API}/auth`} className="ql-button">Conectar meu GitHub <ArrowUpRight size={16} /></a></section>}
        </>}
        {tab === 'ranking' && <>
          <div className="ql-ranking-kind" role="group" aria-label="Tipo de ranking"><button aria-pressed={rankKind === 'global'} onClick={() => { setRankKind('global'); window.location.hash = 'ranking'; }}>Global</button><button aria-pressed={rankKind === 'community'} onClick={() => { setRankKind('community'); window.location.hash = 'ranking/community'; }}>Comunitário</button></div>
          {rankKind === 'community' ? <CommunityRanking connected={me?.connected} revision={stats?.syncedAt} /> : <>
          <section className="ql-rank-intro"><div><span className="ql-tag ql-green-tag"><Trophy size={13} /> TEMPORADA {ranking.period}</span></div>{me?.connected && <div className="ql-ranking-position"><small>SUA POSIÇÃO</small><strong>{position ? `#${position}` : '—'}</strong><button className="ql-button ql-button-secondary" disabled={busy || loading} onClick={participate}>{me.optedIn ? 'Sair do ranking' : 'Participar do ranking'}<ArrowUpRight size={15} /></button></div>}</section>
          <RankingPodium users={ranking.users} />
          <section className="ql-panel"><div className="ql-panel-head"><h2>Classificação global</h2><span className="ql-tag">TOP 100 · {ranking.period}</span></div>{!ranking.users.length ? <div className="ql-empty"><Trophy size={36} /><h3>A arena está aberta.</h3><p>Sincronize suas contribuições e participe para iniciar o ranking.</p></div> : <div className="ql-table-scroll"><table className="ql-ranking-table"><caption className="ql-sr-only">Ranking global mensal por XP</caption><thead><tr><th scope="col">Posição</th><th scope="col">Desenvolvedor</th><th scope="col">Nível</th><th scope="col">XP da temporada</th></tr></thead><tbody>{ranking.users.map((user, index) => <tr key={user.githubId} className={user.githubLogin === me?.login ? 'ql-my-row' : ''}><th scope="row">#{String(index + 1).padStart(2, '0')}</th><td><div className="ql-table-profile"><CosmeticAvatar src={user.picture} appearance={user.appearance} frame={user.appearance?.frame} size={42} /><div><a href={`#profile/${user.githubId}`}>@{user.githubLogin}{user.githubLogin === me?.login && <span className="ql-you">VOCÊ</span>}</a><small>{user.career?.title || user.githubStats.title}</small><CosmeticTitle appearance={user.appearance} title={user.appearance?.title} /></div></div></td><td><span className="ql-level-chip">LVL {user.career?.level || user.githubStats.level}</span></td><td className="ql-green">{number(user.githubStats.xp)} XP</td></tr>)}</tbody></table></div>}<p className="ql-caption">Participar torna seu resumo de progresso e conquistas públicos. Ao sair, seu perfil fica indisponível para novas consultas. Empates seguem o identificador estável da conta. A posição considera todos os participantes, mesmo fora do Top 100.</p></section>
          </>}
        </>}
        {tab === 'community' && <CommunitySocial me={me} />}
        {tab === 'goals' && <PersonalGoals connected={me?.connected} revision={stats?.syncedAt} />}
        {tab === 'missions' && <Missions connected={me?.connected} revision={stats?.syncedAt} onClaimed={async () => { setMe(await request('/me')); await loadRanking(); }} />}
        {tab === 'me' && <MyProfile me={me} onSaved={(profile, appearance) => setMe(current => ({ ...current, profile, ...(appearance ? { appearance } : {}) }))} onAppearanceSaved={appearance => { setMe(current => ({ ...current, appearance })); setRanking(current => ({ ...current, users: current.users.map(user => user.githubId === me.githubId ? { ...user, appearance } : user) })); }} />}
        {tab === 'seasons' && <SeasonHistory connected={me?.connected} career={career} />}
        {tab === 'profile' && profileId && <PublicProfile key={profileId} githubId={profileId} connected={Boolean(me?.connected&&me.githubId!==profileId)} />}
      </main>
    </div>
    <div className="ql-site-footer"><CommunityFooter /></div>
  </div></ChatDockProvider></SafetyProvider>;
}
function Metric({ icon: Icon, label, value, note, tone = 'green' }) {
  return <section className={`ql-panel ql-metric ql-tone-${tone}`}><span className="ql-metric-icon"><Icon size={19} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></section>;
}
