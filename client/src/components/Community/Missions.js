import React, { useEffect, useState } from 'react';
import { Target, CheckCircle2, Clock3, Zap, ArrowUpRight } from 'lucide-react';
const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
const labels = { daily: 'Diárias', weekly: 'Semanais', monthly: 'Mensais' };
export default function Missions({ connected }) {
  const [kind, setKind] = useState('daily');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!connected) return;
    let mounted = true;
    let loading = false;
    const controller = new AbortController();
    async function load() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const response = await fetch(`${API}/missions`, { credentials: 'include', signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Não foi possível carregar as missões.');
        if (mounted) { setData(value); setError(''); }
      } catch (err) { if (mounted && err.name !== 'AbortError') setError(err.message); }
      finally { loading = false; }
    }
    load(); const timer = window.setInterval(load, 60000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [connected]);
  if (!connected) return <section className="ql-panel ql-empty"><Target size={34} /><h2>Seu próximo objetivo está aqui.</h2><p>Entre com GitHub para ativar as missões e acompanhar seus bônus.</p><a href={`${API}/auth`} className="ql-button">Entrar com GitHub <ArrowUpRight size={16} /></a></section>;
  const selected = data?.missions?.filter((mission) => mission.kind === kind) || [];
  const earned = data?.missions?.filter((mission) => mission.awarded).reduce((sum, mission) => sum + mission.xp, 0) || 0;
  return <div className="ql-missions">
    <section className="ql-panel ql-mission-intro"><div><p className="ql-eyebrow">CADA OBJETIVO É UM PASSO A MAIS</p><h2>Você programa. Seu progresso aparece.</h2><p className="ql-muted">Ganhe XP pelas suas ações normalmente e receba estes bônus extras ao completar os objetivos.</p></div><div className="ql-mission-earned"><Zap size={19} /><strong>+{earned.toLocaleString('pt-BR')} XP</strong><span>recebidos nas missões ativas</span></div></section>
    <div className="ql-mission-tabs" role="group" aria-label="Frequência das missões">{Object.entries(labels).map(([id, label]) => <button key={id} aria-pressed={kind === id} className={kind === id ? 'is-active' : ''} onClick={() => setKind(id)}>{label}<span>{data?.missions?.filter((mission) => mission.kind === id && mission.awarded).length || 0}/5</span></button>)}</div>
    {error && <p className="ql-error" role="alert">{error}</p>}{!data && !error && <p className="ql-muted" role="status">Carregando seus objetivos…</p>}
    {data?.error && <p className="ql-error">{data.error}</p>}{data?.partial && <p className="ql-caption">Alguns dados ficaram pendentes nesta consulta. O progresso usa apenas evidências confirmadas e pode aumentar nas próximas sincronizações.</p>}
    <div className="ql-mission-grid">{selected.map((mission) => <section key={`${mission.id}:${mission.periodKey}`} className={`ql-panel ql-mission-card ${mission.awarded ? 'is-complete' : ''}`}>
      <div className="ql-mission-card-head"><span className="ql-tag">MISSÃO {mission.number}</span><span className="ql-mission-xp">+{mission.xp.toLocaleString('pt-BR')} XP</span></div>
      <h3>{mission.description}</h3><p className="ql-mission-deadline"><Clock3 size={12} />Até {new Date(mission.endsAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC</p>
      <ul className="ql-mission-requirements">{mission.requirements.map((requirement) => <li key={requirement.label}><span>{requirement.label}</span><strong className={requirement.current >= requirement.target ? 'ql-green' : ''}>{Math.min(requirement.current, requirement.target)}/{requirement.target}</strong></li>)}</ul>
      {mission.repo && <p className="ql-caption">Projeto: {mission.repo}</p>}
      <div className="ql-xp-track" role="progressbar" aria-label={`Progresso da missão ${mission.number} ${labels[kind]}`} aria-valuenow={mission.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${mission.progress}%` }} /></div>
      <p className="ql-mission-encouragement">{mission.awarded ? <CheckCircle2 size={16} /> : <Target size={16} />}{mission.encouragement}</p>
      {mission.completedAt && !mission.awarded && <p className="ql-caption">Objetivo identificado. A confirmação do crédito ocorrerá na próxima validação do servidor.</p>}
    </section>)}</div>
    <section className="ql-panel ql-caption"><p>Bônus automáticos, uma vez por missão e período. Contam na carreira e na temporada em que forem confirmados. Uma ação pode avançar objetivos diários, semanais e mensais.</p><p>Dia e mês em UTC; semana de segunda a domingo. A validação acompanha a sincronização do GitHub a cada dez minutos. Esta tela consulta o resultado salvo a cada minuto.</p><p>Ativadas em {data?.startedAt ? new Date(data.startedAt).toLocaleString('pt-BR') : '…'}: apenas ações posteriores contam. Consultas atrasadas têm até 48 horas após o período terminar para confirmar objetivos. Uma release estruturada não comprova que o projeto funciona.</p></section>
  </div>;
}
