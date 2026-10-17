import { readApiResponse } from './apiResponse';
import CommunityChallenge from './CommunityChallenge';
import React, { useEffect, useRef, useState } from 'react';
import { Target, CheckCircle2, Clock3, Zap, ArrowUpRight } from 'lucide-react';
const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
const howTo = {
  'daily-1': 'Envie uma alteração real a um repositório público. O commit precisa estar na branch padrão e associado à sua conta.',
  'daily-2': 'Abra um pull request público com alterações de conteúdo. Rascunhos não contam.',
  'daily-3': 'Conclua uma alteração e tenha um pull request de sua autoria mesclado em um repositório público.',
  'daily-4': 'Envie uma revisão em um pull request público de outra pessoa. Revisões pendentes não contam.',
  'daily-5': 'Vincule uma issue ao seu pull request. O merge desse PR deve ser o evento que fecha a issue.',
  'weekly-1': 'Distribua seu trabalho por três datas UTC diferentes; vários commits no mesmo dia contam como um dia.',
  'weekly-2': 'Envie dez commits elegíveis, distribuídos em pelo menos dois dias UTC.',
  'weekly-3': 'Tenha três pull requests próprios mesclados durante esta semana UTC.',
  'weekly-4': 'Envie revisões em três pull requests diferentes de outras pessoas; repetir a revisão do mesmo PR não aumenta a contagem.',
  'weekly-5': 'Colabore em dois PRs seus que sejam mesclados por outras pessoas. Bots e merges feitos por você não contam para este objetivo.',
  'monthly-1': 'Mantenha atividade em doze datas UTC diferentes ao longo do mês.',
  'monthly-2': 'Distribua trinta commits elegíveis por três semanas UTC distintas dentro do mês.',
  'monthly-3': 'Tenha oito PRs próprios mesclados, com entregas em pelo menos duas semanas UTC.',
  'monthly-4': 'Tenha quatro PRs próprios aceitos por outras pessoas, distribuídos por pelo menos dois repositórios públicos.',
  'monthly-5': 'Publique uma release sua reunindo vinte commits próprios em cinco dias, cinco PRs próprios mesclados, README e arquivo de implementação nessa versão.'
};
const labels = { daily: 'Diárias', weekly: 'Semanais', monthly: 'Mensais' };
export default function Missions({ connected, revision, onClaimed }) {
  const [kind, setKind] = useState('daily');
  const [pendingOpen, setPendingOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(null);
  const requestEpoch = useRef(0);
  const claimingRef = useRef(false);
  useEffect(() => {
    if (!connected) return;
    let mounted = true;
    let loading = false;
    const controller = new AbortController();
    async function load() {
      if (loading || claimingRef.current || document.visibilityState === 'hidden') return;
      const epoch = requestEpoch.current;
      loading = true;
      try {
        const response = await fetch(`${API}/missions`, { credentials: 'include', signal: controller.signal });
        const value = await readApiResponse(response);
        if (!response.ok) throw new Error(value.error || 'Não foi possível carregar as missões.');
        if (mounted && epoch === requestEpoch.current) { setData(value); setError(''); }
      } catch (err) { if (mounted && epoch === requestEpoch.current && err.name !== 'AbortError') setError(err.message); }
      finally { loading = false; }
    }
    load(); const timer = window.setInterval(load, 60000);
    let lastResume = 0;
    const resume = () => { if (document.visibilityState === 'visible' && Date.now() - lastResume > 10000) { lastResume = Date.now(); load(); } };
    document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [connected, revision]);
  async function claim(mission) {
    const key = `${mission.id}:${mission.periodKey}`;
    requestEpoch.current += 1; claimingRef.current = true;
    setClaiming(key); setError('');
    try {
      const response = await fetch(`${API}/missions/claim`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId: mission.id, periodKey: mission.periodKey }) });
      const value = await readApiResponse(response);
      if (!response.ok) throw new Error(value.error || 'Não foi possível receber o bônus.');
      setData(value);
      if (onClaimed) await onClaimed();
    } catch (err) { setError(err.message); }
    finally { claimingRef.current = false; setClaiming(null); }
  }
  if (!connected) return <section className="ql-panel ql-empty"><Target size={34} /><h2>Seu próximo objetivo está aqui.</h2><p>Entre com GitHub para ativar as missões e acompanhar seus bônus.</p><a href={`${API}/auth`} className="ql-button">Entrar com GitHub <ArrowUpRight size={16} /></a></section>;
  const selected = (data?.missions?.filter((mission) => mission.kind === kind && !mission.previousPeriod) || []).sort((a, b) => a.number - b.number);
  const pending = data?.pendingRewards || [];
  const earned = data?.monthlyXP || 0;
  function renderMission(mission) { return <section key={`${mission.id}:${mission.periodKey}`} className={`ql-panel ql-mission-card ${mission.completedAt || mission.awarded ? 'is-complete' : ''}`}>
      <div className="ql-mission-content"><div className="ql-mission-card-head"><span className="ql-tag">MISSÃO {mission.number}</span><span className="ql-mission-xp">+{mission.xp.toLocaleString('pt-BR')} XP</span></div>
      <h3>{mission.description}</h3><details className="ql-mission-how"><summary>Como fazer</summary><p>{howTo[mission.id] || 'Realize o objetivo no GitHub e aguarde a validação das contribuições.'}</p></details>
      <ul className="ql-mission-requirements">{mission.requirements.map((requirement) => <li key={requirement.label}><span>{requirement.label}</span><strong className={requirement.current >= requirement.target ? 'ql-green' : ''}>{Math.min(requirement.current, requirement.target)}/{requirement.target}</strong></li>)}</ul>
      {mission.repo && <p className="ql-caption">Projeto: {mission.repo}</p>}
      <div className="ql-xp-track" role="progressbar" aria-label={`Progresso da missão ${mission.number} ${labels[mission.kind]}`} aria-valuenow={mission.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${mission.progress}%` }} /></div>
      <p className="ql-mission-encouragement">{mission.awarded ? <CheckCircle2 size={16} /> : <Target size={16} />}{mission.encouragement}</p>
      {mission.completedAt && !mission.awarded && <p className="ql-caption">Concluída! Receba seu bônus para somar este XP à carreira e ao ranking.</p>}
      </div><div className="ql-mission-action"><p className="ql-mission-deadline"><Clock3 size={12} />{mission.previousPeriod ? 'Prazo' : mission.awarded ? 'Renova' : 'Até'} {new Date(new Date(mission.endsAt).getTime() + (mission.previousPeriod ? 48 * 3600000 : 0)).toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} UTC</p><span className="ql-caption">{mission.awarded ? 'Bônus recebido' : mission.completedAt ? 'Missão concluída' : 'Em progresso'}</span><button className="ql-button ql-claim" disabled={Boolean(claiming) || mission.awarded || !mission.completedAt} onClick={() => claim(mission)} aria-label={mission.previousPeriod ? `Receber bônus pendente da missão ${mission.number} ${labels[mission.kind]}` : `${mission.awarded ? 'Recebido' : 'Receber'} bônus da missão ${mission.number}`}>
        {mission.awarded ? <CheckCircle2 size={16} /> : <Zap size={16} />}{mission.awarded ? 'Recebido' : claiming === `${mission.id}:${mission.periodKey}` ? 'Recebendo…' : 'Receber'}
      </button>{mission.awarded && <small className="ql-caption">Bloqueada até a renovação</small>}</div>
    </section>; }
  return <div className="ql-missions">
    <CommunityChallenge revision={revision} />
    <section className="ql-panel ql-mission-month-total"><h2>XP acumulado das missões deste mês</h2><strong><Zap size={17} />{data ? `${earned.toLocaleString('pt-BR')} XP` : '…'}</strong></section>
    <div className="ql-mission-tabs" role="group" aria-label="Frequência das missões">{Object.entries(labels).map(([id, label]) => <button key={id} aria-pressed={kind === id} className={kind === id ? 'is-active' : ''} onClick={() => setKind(id)}>{label}<span>{data?.missions?.filter((mission) => mission.kind === id && !mission.previousPeriod && mission.awarded).length || 0}/5</span></button>)}</div>
    {error && <p className="ql-error" role="alert">{error}</p>}{!data && !error && <p className="ql-muted" role="status">Carregando seus objetivos…</p>}
    {data?.error && <p className="ql-error">{data.error}</p>}{data?.partial && <p className="ql-caption">Alguns dados ficaram pendentes nesta consulta. O progresso usa apenas evidências confirmadas e pode aumentar nas próximas sincronizações.</p>}
    <div className="ql-mission-grid">{selected.map(renderMission)}</div>
    {pending.length > 0 && <section className="ql-pending-rewards"><button type="button" aria-expanded={pendingOpen} onClick={() => setPendingOpen(open => !open)}>Bônus pendentes <span>{pending.length}</span></button>{pendingOpen && <><p className="ql-caption">Objetivos já concluídos, ainda disponíveis para recebimento por tempo limitado.</p><div className="ql-mission-grid">{pending.map(renderMission)}</div></>}</section>}
    <details className="ql-panel ql-caption ql-mission-general-rules"><summary>Regras das missões</summary><p>Clique em Receber após concluir. Cada bônus pode ser recebido uma vez por missão e período e conta na carreira e na temporada do recebimento. Uma ação pode avançar objetivos diários, semanais e mensais.</p><p>Dia e mês em UTC; semana de segunda a domingo. A validação acompanha a sincronização do GitHub a cada dez minutos. Esta tela consulta o resultado salvo a cada minuto.</p><p>Ativadas em {data?.startedAt ? new Date(data.startedAt).toLocaleString('pt-BR') : '…'}: apenas ações posteriores contam. Objetivos concluídos podem ser recebidos até 48 horas após o período terminar. Uma release estruturada não comprova que o projeto funciona.</p></details>
  </div>;
}
