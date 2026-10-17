import React, { useState } from 'react';
import { Flag, CheckCircle2, ArrowUpRight, Target } from 'lucide-react';
import useCommunityData, { COMMUNITY_API } from './useCommunityData';
export default function PersonalGoals({ connected, revision }) {
  const { data, setData, error } = useCommunityData('/goals', connected, revision);
  const [metric, setMetric] = useState('days');
  const [target, setTarget] = useState(3);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  async function create(event) {
    event.preventDefault(); setBusy(true); setSaveError('');
    try {
      const response = await fetch(`${COMMUNITY_API}/goals`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric, target: Number(target) }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Não foi possível definir a meta.');
      setData(value);
    } catch (err) { setSaveError(err.message); }
    finally { setBusy(false); }
  }
  if (!connected) return <section className="ql-panel ql-empty"><Flag size={32} /><h2>Sua evolução, no seu ritmo.</h2><p>Entre com GitHub para escolher sua meta pessoal.</p></section>;
  const option = data?.options?.find(item => item.id === metric);
  const goal = data?.goal;
  return <div className="ql-goals"><section className="ql-panel ql-goal-intro"><p className="ql-eyebrow">UM COMPROMISSO COM VOCÊ</p><h2>Pequenos objetivos. Progresso de verdade.</h2><p className="ql-muted">Escolha uma meta por semana. Você decide o ritmo; suas contribuições confirmadas mostram o caminho.</p></section>
    {(error || saveError) && <p className="ql-error" role="alert">{saveError || error}</p>}
    {!data && !error && <p role="status" className="ql-muted">Carregando sua meta…</p>}
    {data && (goal ? <section className={`ql-panel ql-goal-active ${goal.completedAt ? 'is-complete' : ''}`}><div className="ql-panel-head"><span className="ql-tag ql-green-tag"><Flag size={14} /> META DA SEMANA</span><span className="ql-goal-status">{goal.completedAt ? <><CheckCircle2 size={16} /> Concluída</> : 'Em andamento'}</span></div><h2>{goal.label}</h2><div className="ql-goal-count"><strong>{Math.min(goal.current, goal.target)}<span> / {goal.target}</span></strong><p>{goal.unit}</p></div><div className="ql-xp-track" role="progressbar" aria-label="Progresso da meta pessoal" aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${goal.progress}%` }} /></div><p className="ql-muted">{goal.completedAt ? 'Você cumpriu o que escolheu. Leve essa constância para a próxima semana!' : `Faltam ${Math.max(0, goal.target - goal.current)} para alcançar seu objetivo. Cada contribuição ajuda.`}</p><p className="ql-caption">Ações posteriores à escolha, em {new Date(goal.createdAt).toLocaleString('pt-BR')}. Prazo: {new Date(goal.endsAt).toLocaleString('pt-BR')} (segunda-feira, 00h UTC).</p><a className="ql-text-link" href="#progress">Acompanhar meu progresso <ArrowUpRight size={15} /></a></section>
      : <form className="ql-panel ql-goal-form" onSubmit={create}><div className="ql-panel-head"><h2>Qual será seu próximo passo?</h2><Target size={24} className="ql-green" /></div><label className="ql-field">Objetivo<select value={metric} onChange={event => { const next = data.options.find(item => item.id === event.target.value); setMetric(next.id); setTarget(next.suggested); }} disabled={busy}>{data.options?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="ql-field">Quantidade<input type="number" min={1} max={option?.max || 7} step={1} required value={target} disabled={busy} onChange={event => setTarget(event.target.value)} /><span className="ql-caption">De 1 a {option?.max || 7} {option?.unit}.</span></label><p className="ql-caption">Escolha com calma: uma meta por semana, sem troca durante o período. Prazo desta semana: {new Date(data.endsAt).toLocaleString('pt-BR')}. Só ações após a escolha contam.</p><button className="ql-button" disabled={busy}>{busy ? 'Salvando…' : 'Assumir minha meta'}<Flag size={16} /></button></form>)}
    {data?.partial && <p className="ql-caption">A coleta está parcial. Novas evidências podem aparecer na próxima sincronização.</p>}{data?.error && <p className="ql-error">{data.error}</p>}
    <section className="ql-panel ql-caption">As metas pessoais não concedem XP adicional e não exigem sequência diária. Suas ações e os bônus das missões continuam pontuando normalmente. Uma nova escolha é liberada toda segunda-feira, às 00h UTC.</section>
  </div>;
}
