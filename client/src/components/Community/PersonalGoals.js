import React, { useState } from 'react';
import { Flag, CheckCircle2, ArrowUpRight, Code2, Plus, Archive } from 'lucide-react';
import useCommunityData, { COMMUNITY_API } from './useCommunityData';
import { readApiResponse } from './apiResponse';
import { normalizeRepositoryURL, REPOSITORY_HELP } from './repositoryURL';
const dateLabel = date => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Sem prazo definido';
export default function PersonalGoals({ connected, revision }) {
  const { data, setData, error } = useCommunityData('/goals', connected, revision);
  const [mode, setMode] = useState('suggested');
  const [templateId, setTemplateId] = useState('commerce');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('Planejar o projeto\nImplementar as funcionalidades\nTestar e documentar');
  const [dueDate, setDueDate] = useState('');
  const [repository, setRepository] = useState('');
  const [newGoal, setNewGoal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const goal = data?.goal;
  const template = data?.templates?.find(item => item.id === templateId);
  async function mutate(path, body) {
    setBusy(true); setSaveError('');
    try {
      const response = await fetch(`${COMMUNITY_API}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setData(await readApiResponse(response)); setNewGoal(false);
    } catch (err) {
      setSaveError(err.message);
      if (err.status === 409) {
        try { setData(await readApiResponse(await fetch(`${COMMUNITY_API}/goals`, { credentials: 'include' }))); } catch (_) { /* Keep the last saved goal visible. */ }
      }
    } finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault(); setSaveError('');
    let repo = '';
    try { repo = repository.trim() ? normalizeRepositoryURL(repository) : ''; }
    catch (err) { setSaveError(err.message); return; }
    const labels = steps.split('\n').map(step => step.trim()).filter(Boolean);
    if (mode === 'custom' && (!title.trim() || labels.length < 1 || labels.length > 12 || labels.some(step => step.length > 160))) { setSaveError('Defina um título e de 1 a 12 etapas, com até 160 caracteres cada.'); return; }
    await mutate('/goals', { mode, templateId, title, description, steps: labels, dueDate, repository: repo });
  }
  const update = change => mutate('/goals/update', { goalId: goal.id, version: goal.version, ...change });
  if (!connected) return <section className="ql-panel ql-empty"><Flag size={32} /><h2>Sua evolução, no seu ritmo.</h2><p>Entre com GitHub para planejar seu próximo projeto.</p></section>;
  const showForm = data && (!goal || goal.status === 'archived' || newGoal);
  return <div className="ql-goals"><section className="ql-panel ql-goal-intro"><p className="ql-eyebrow">DA IDEIA À PRIMEIRA ENTREGA</p><h2>Escolha o que você quer construir.</h2><p className="ql-muted">Use um roteiro sugerido ou crie sua própria meta. Um projeto ativo por vez, com etapas e prazo escolhidos por você.</p></section>
    {(error || saveError) && <p className="ql-error" role="alert">{saveError || error}</p>}{!data && !error && <p role="status" className="ql-muted">Carregando suas metas…</p>}
    {goal && goal.status !== 'archived' && !newGoal && <section className={`ql-panel ql-goal-active ${goal.status === 'completed' ? 'is-complete' : ''}`}><div className="ql-panel-head"><span className="ql-tag ql-green-tag"><Flag size={14} /> MEU PROJETO</span><span className="ql-goal-status">{goal.status === 'completed' ? <><CheckCircle2 size={16} /> Concluído por você</> : 'Em construção'}</span></div><h2>{goal.title}</h2><p className="ql-goal-description">{goal.description}</p><div className="ql-goal-progress-line"><strong>{goal.current}/{goal.target} etapas</strong><span className="ql-caption">{dateLabel(goal.dueDate)}</span></div><div className="ql-xp-track" role="progressbar" aria-label="Progresso da meta pessoal" aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${goal.progress}%` }} /></div><div className="ql-goal-checklist">{goal.steps.map(step => <label className={step.done ? 'is-done' : ''} key={step.id}><input type="checkbox" checked={step.done} disabled={busy} onChange={event => update({ action: 'step', stepId: step.id, done: event.target.checked })} /><span>{step.label}</span></label>)}</div><p className="ql-caption">{goal.status === 'completed' ? 'Você marcou todas as etapas. Que tal documentar o que aprendeu antes do próximo projeto?' : 'Avance uma etapa de cada vez. Você marca o que concluiu; o checklist fica salvo no seu perfil privado.'}</p><GoalDetails key={goal.id} goal={goal} busy={busy} onSave={update} />
      <div className="ql-goal-actions"><a className="ql-text-link" href="#progress">Ver minhas contribuições <ArrowUpRight size={15} /></a>{goal.status === 'completed' ? <button className="ql-button" disabled={busy} onClick={() => setNewGoal(true)}><Plus size={15} />Começar outra meta</button> : <button className="ql-refresh" disabled={busy} onClick={() => update({ action: 'archive' })}><Archive size={15} />Arquivar e escolher outra</button>}</div></section>}
    {showForm && <form className="ql-panel ql-goal-form ql-project-goal-form" noValidate onSubmit={create}><div className="ql-goal-modes" role="group" aria-label="Tipo de meta"><button type="button" aria-pressed={mode === 'suggested'} onClick={() => setMode('suggested')}><Code2 size={17} />Projetos sugeridos</button><button type="button" aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}><Flag size={17} />Meta própria</button></div>
      {mode === 'suggested' ? <><div className="ql-goal-template-grid">{data.templates?.map(item => <button type="button" key={item.id} aria-pressed={templateId === item.id} onClick={() => setTemplateId(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div>{template && <div className="ql-goal-roadmap"><h3>Seu roteiro inicial</h3><ol>{template.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="ql-caption">Adapte a tecnologia ao seu nível. O roteiro é um ponto de partida.</p></div>}</> : <><label className="ql-field">Título da meta<input maxLength={80} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: construir meu primeiro sistema de estoque" disabled={busy} /></label><label className="ql-field">Descrição da meta<textarea maxLength={600} rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></label><label className="ql-field">Etapas da meta<textarea rows={5} value={steps} maxLength={2000} onChange={event => setSteps(event.target.value)} disabled={busy} /><span className="ql-caption">Uma etapa por linha. De 1 a 12 etapas, até 160 caracteres cada.</span></label></>}
      <div className="ql-goal-form-details"><label className="ql-field">Prazo desejado · opcional<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={busy} /></label><label className="ql-field">Repositório GitHub · opcional<input value={repository} maxLength={500} onChange={event => setRepository(event.target.value)} placeholder="https://github.com/usuario/repositorio" disabled={busy} /><span className="ql-caption">{REPOSITORY_HELP}</span></label></div><div className="ql-goal-actions">{newGoal && <button className="ql-refresh" type="button" onClick={() => setNewGoal(false)}>Voltar à meta concluída</button>}<button className="ql-button" disabled={busy}>{busy ? 'Salvando…' : 'Começar projeto'}<Flag size={16} /></button></div></form>}
    {Boolean(data?.history?.length) && <details className="ql-goal-history"><summary>Metas anteriores ({data.history.length})</summary>{data.history.map(item => <div key={item.id}><strong>{item.title}</strong><span>{item.status === 'completed' ? 'Concluída por você' : 'Arquivada'} · {item.current}/{item.target} etapas</span></div>)}</details>}
    <section className="ql-panel ql-caption">Estas metas são pessoais e não concedem XP extra. Etapas marcadas e repositórios vinculados não comprovam que o projeto funciona. Suas ações no GitHub e as missões continuam pontuando normalmente.</section>
  </div>;
}
function GoalDetails({ goal, busy, onSave }) {
  const [repository, setRepository] = useState(goal.repository || '');
  const [dueDate, setDueDate] = useState(goal.dueDate || '');
  const [error, setError] = useState('');
  function save(event) {
    event.preventDefault(); setError('');
    let repo = '';
    try { repo = repository.trim() ? normalizeRepositoryURL(repository) : ''; }
    catch (err) { setError(err.message); return; }
    onSave({ action: 'details', repository: repo, dueDate });
  }
  return <details className="ql-goal-settings"><summary>Repositório e prazo</summary>{goal.repository && <a href={goal.repository} className="ql-text-link" target="_blank" rel="noopener noreferrer">Abrir repositório <ArrowUpRight size={14} /></a>}<form noValidate onSubmit={save}><label className="ql-field">Repositório vinculado<input value={repository} maxLength={500} onChange={event => setRepository(event.target.value)} disabled={busy} placeholder="https://github.com/usuario/repositorio" /><span className="ql-caption">{REPOSITORY_HELP}</span></label><label className="ql-field">Prazo da meta<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} disabled={busy} /></label>{error && <p role="alert" className="ql-error">{error}</p>}<button className="ql-button ql-button-secondary" disabled={busy}>Salvar repositório e prazo</button></form></details>;
}
