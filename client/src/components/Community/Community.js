import React, { useCallback, useEffect, useState } from 'react';
import { Github, Trophy, RefreshCw, GitCommitHorizontal, GitPullRequest, Award } from 'lucide-react';
import ProgressBar from '../XP Management/ProgressBar';
import ScoreDetails from './ScoreDetails';

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
const oauthErrors = {
  config: 'O login GitHub ainda precisa ser configurado pelo administrador.',
  oauth: 'Não foi possível entrar com GitHub. Tente novamente e confira a configuração do OAuth.'
};
export default function Community() {
  const [me, setMe] = useState(null);
  const [ranking, setRanking] = useState({ users: [], period: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthErrors[new URLSearchParams(window.location.search).get('error')] || '');
  const loadRanking = useCallback(async () => setRanking(await request('/leaderboard')), []);
  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const board = await request('/leaderboard');
        if (mounted) setRanking(board);
      } catch (err) { if (mounted) setError(err.message); }
      try {
        const user = await request('/me');
        if (mounted) setMe(user);
        // Refresh while visible; no unattended server scheduling yet.
        if (user.connected && (!user.stats || Date.now() - new Date(user.stats.syncedAt).getTime() > 60000)) {
          try {
            const stats = await request('/sync', {});
            const board = await request('/leaderboard');
            if (mounted) { setMe({ ...user, stats }); setRanking(board); }
          } catch (err) { if (mounted && err.status !== 429) setError(err.message); }
        }
      } catch (err) {
        if (mounted && err.status === 401) setMe(null);
        else if (mounted) setError(err.message);
      }
      finally { inFlight = false; if (mounted) setLoading(false); }
    }
    load();
    const timer = window.setInterval(load, 60000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  async function sync() {
    setBusy(true); setError('');
    try {
      const stats = await request('/sync', {});
      setMe((user) => ({ ...user, stats }));
      await loadRanking();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function participate() {
    setBusy(true); setError('');
    try {
      const data = await request('/participation', { optedIn: !me.optedIn });
      setMe((user) => ({ ...user, optedIn: data.optedIn }));
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
  const card = 'rounded-2xl border border-slate-700 bg-slate-800/70 p-6';
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <a href="/community" className="flex items-center gap-3 font-bold text-xl"><Github aria-hidden="true" /> QuestLog <span className="text-indigo-400">Community</span></a>
          {me && <button disabled={busy} onClick={logout} className="text-sm underline disabled:opacity-50">Sair da conta</button>}
        </header>
        <section className="py-7 space-y-4">
          <p className="text-indigo-400 font-semibold text-sm uppercase tracking-widest">Comunidade de desenvolvedores · MVP</p>
          <h1 className="text-4xl md:text-5xl font-bold max-w-3xl leading-tight">Seu código vira progresso.</h1>
          <p className="text-slate-300 max-w-2xl">Conecte o GitHub, acompanhe suas contribuições públicas e evolua no ranking mensal da comunidade.</p>
          {!loading && !me?.connected && <a href={`${API}/auth`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-5 py-3 font-semibold"><Github size={20} /> Entrar com GitHub</a>}
          {me && !me.connected && <p className="text-sm text-slate-400">Sua sessão atual é do Google. Entre com GitHub para criar seu perfil competitivo separado.</p>}
        </section>
        {error && <p role="alert" className="rounded-xl border border-amber-600 bg-amber-950 p-4">{error}</p>}
        {loading && <p role="status">Carregando comunidade e sincronizando contribuições…</p>}
        <div className="grid lg:grid-cols-3 gap-6">
          <section className={`${card} lg:col-span-1 space-y-5`} aria-label="Seu perfil">
            <h2 className="text-xl font-semibold">Sua jornada</h2>
            {me?.connected ? <>
              <div className="flex items-center gap-3"><img src={me.picture} alt="" className="w-12 h-12 rounded-full" /><div><a className="font-semibold hover:underline" href={`https://github.com/${me.login}`} target="_blank" rel="noreferrer">@{me.login}</a><p className="text-sm text-indigo-300">{stats?.title || 'Explorador'}</p></div></div>
              <div className="text-4xl font-bold">{stats?.xp || 0} <span className="text-base text-slate-400">XP neste mês</span></div>
              <div className="bg-slate-100 rounded-xl"><ProgressBar level={stats?.level || 1} experience={stats?.experience || 0} userName={me.login} /></div>
              <div className="flex flex-wrap gap-4 text-sm"><span className="flex gap-2"><GitCommitHorizontal size={18} />{stats?.commits || 0} commits pontuados</span><span className="flex gap-2"><GitPullRequest size={18} />{stats?.mergedPRs || 0} PRs pontuados</span></div>
              <div className="flex flex-wrap gap-2">{stats?.achievements?.map((badge) => <span key={badge} className="inline-flex gap-1 items-center rounded-full bg-indigo-500/20 px-3 py-1 text-xs"><Award size={14} />{badge}</span>)}</div>
              <button disabled={busy || loading} onClick={sync} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 disabled:opacity-50"><RefreshCw size={16} />{busy ? 'Atualizando…' : 'Sincronizar GitHub'}</button>
              <button disabled={busy || loading} onClick={participate} className="text-sm underline disabled:opacity-50">{me.optedIn ? 'Sair do ranking público' : 'Participar do ranking público'}</button>
              <p className="text-xs text-indigo-300">Atualização automática ativa enquanto a página estiver visível · a cada minuto</p>
              <p className="text-xs text-slate-400">{stats ? `Última sincronização: ${new Date(stats.syncedAt).toLocaleString('pt-BR')}` : 'Ainda sem contribuições sincronizadas.'}</p>
            </> : <p className="text-slate-400">Entre com GitHub para acompanhar XP, nível e conquistas. Você escolhe se quer aparecer no ranking público.</p>}
          </section>
          <section className={`${card} lg:col-span-2`} aria-labelledby="ranking-title">
            <div className="flex flex-wrap justify-between gap-3 mb-5"><h2 id="ranking-title" className="flex items-center gap-2 text-xl font-semibold"><Trophy className="text-amber-400" /> Ranking global</h2><span className="text-slate-400 text-sm">{ranking.period} · mês UTC · Top 100</span></div>
            {ranking.users.length === 0 ? <p className="text-slate-400 py-8">O ranking está começando. Conecte sua conta, sincronize e participe.</p> : <ol className="divide-y divide-slate-700">{ranking.users.map((user, index) => <li key={user.githubId} className="flex items-center gap-3 py-4"><span className="text-slate-400 w-7">{index + 1}º</span><img src={user.picture} alt="" className="w-9 h-9 rounded-full" /><div className="min-w-0 flex-1"><a href={`https://github.com/${user.githubLogin}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline break-all">@{user.githubLogin}</a><p className="text-xs text-slate-400">Nível {user.githubStats.level} · {user.githubStats.title}</p></div><strong className="whitespace-nowrap">{user.githubStats.xp} XP</strong></li>)}</ol>}
          </section>
        </div>
        {me?.connected && <ScoreDetails stats={stats} />}
        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">Regras da primeira temporada</h2>
          <p className="text-sm text-slate-300">10 XP por commit reconhecido nas contribuições públicas do GitHub, até 20 por dia. 50 XP por PR público mesclado, até 100 por mês. Empates seguem o identificador estável da conta.</p>
          <p className="text-sm text-slate-400">XP, níveis e conquistas são mensais e reiniciam a cada mês UTC. Tarefas manuais não pontuam. O GitHub pode demorar para reconhecer commits; commits fora dos critérios de contribuição do perfil não entram. Quantidade não mede qualidade técnica.</p>
          <p className="text-sm text-slate-400">Atualização automática a cada minuto enquanto esta página estiver visível, e ao voltar para ela. O botão permite atualizar após 30 segundos. Com o site fechado, a sincronização fica pausada. A pontuação pode diminuir se contribuições deixarem de ser reconhecidas. Importação limitada a menos de 100 repositórios por mês.</p>
          <p className="text-xs text-slate-500">Base open source: QuestLog · licença MIT. Participação pública opcional; tokens permanecem criptografados no servidor.</p>
        </section>
      </div>
    </main>
  );
}
