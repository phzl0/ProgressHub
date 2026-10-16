const DAY = 86400000;
const version = 1;
function dayStart(date) { return new Date(`${date.toISOString().slice(0, 10)}T00:00:00Z`); }
function weekStart(date) { const start = dayStart(date); start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7); return start; }
function windowFor(kind, date) {
  const start = kind === 'daily' ? dayStart(date) : kind === 'weekly' ? weekStart(date) : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = kind === 'monthly' ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) : new Date(start.getTime() + (kind === 'daily' ? DAY : 7 * DAY));
  return { kind, key: kind === 'monthly' ? start.toISOString().slice(0, 7) : start.toISOString().slice(0, 10), start, end };
}
const definitions = [
  ['daily', 1, 300, 'Fazer 1 commit público elegível.', [['commits', 1, 'commit elegível']]],
  ['daily', 2, 300, 'Abrir 1 PR público com alteração de conteúdo.', [['opened', 1, 'PR aberto']]],
  ['daily', 3, 500, 'Ter 1 PR de sua autoria mesclado.', [['merged', 1, 'PR mesclado']]],
  ['daily', 4, 300, 'Enviar uma revisão em um PR de outra pessoa.', [['reviews', 1, 'PR de outra pessoa revisado']]],
  ['daily', 5, 500, 'Ter um PR seu mesclado que feche uma issue vinculada.', [['issue', 1, 'PR mesclado que feche uma issue']]],
  ['weekly', 1, 1000, 'Fazer commits elegíveis em 3 dias diferentes.', [['days', 3, 'dias com commits']]],
  ['weekly', 2, 1000, 'Fazer 10 commits elegíveis em pelo menos 2 dias.', [['commits', 10, 'commits elegíveis'], ['days', 2, 'dias com commits']]],
  ['weekly', 3, 1500, 'Ter 3 PRs próprios mesclados.', [['merged', 3, 'PRs mesclados']]],
  ['weekly', 4, 1000, 'Revisar 3 PRs distintos de outras pessoas.', [['reviews', 3, 'PRs distintos revisados']]],
  ['weekly', 5, 1500, 'Ter 2 PRs seus mesclados por outros usuários humanos.', [['collaboration', 2, 'PRs aceitos por outras pessoas']]],
  ['monthly', 1, 2000, 'Fazer commits elegíveis em 12 dias diferentes.', [['days', 12, 'dias com commits']]],
  ['monthly', 2, 2000, 'Fazer 30 commits elegíveis em pelo menos 3 semanas.', [['commits', 30, 'commits elegíveis'], ['weeks', 3, 'semanas com commits']]],
  ['monthly', 3, 3000, 'Ter 8 PRs próprios mesclados em pelo menos 2 semanas.', [['merged', 8, 'PRs mesclados'], ['mergeWeeks', 2, 'semanas com entregas']]],
  ['monthly', 4, 3000, 'Ter 4 PRs próprios aceitos por outras pessoas em pelo menos 2 repositórios.', [['collaboration', 4, 'PRs aceitos por outras pessoas'], ['repos', 2, 'repositórios com colaboração']]],
  ['monthly', 5, 5000, 'Publicar uma release própria com 20 commits em 5 dias, 5 PRs mesclados, README e implementação na mesma versão.', []]
].map(([kind, number, xp, description, requirements]) => ({ id: `${kind}-${number}`, kind, number, xp, description, requirements, version }));
function metric(events, type, target, label) {
  let selected = events.filter((event) => {
    if (['commits', 'days', 'weeks'].includes(type)) return event.kind === 'commit';
    if (type === 'opened') return event.kind === 'opened';
    if (type === 'reviews') return event.kind === 'review';
    if (type === 'issue') return event.kind === 'merged' && event.issueClosed;
    if (['collaboration', 'repos'].includes(type)) return event.kind === 'merged' && event.collaborative;
    return event.kind === 'merged';
  }).sort((a, b) => a.at.localeCompare(b.at));
  const unique = new Map();
  for (const event of selected) {
    const key = type === 'days' ? event.at.slice(0, 10) : ['weeks', 'mergeWeeks'].includes(type) ? weekStart(new Date(event.at)).toISOString() : type === 'repos' ? event.repo : type === 'reviews' ? event.prId : event.id;
    if (!unique.has(key)) unique.set(key, event);
  }
  selected = [...unique.values()];
  return { label, current: selected.length, target, reachedAt: selected.length >= target ? selected[target - 1].at : null };
}
function projectRequirements(events) {
  const releases = events.filter((event) => event.kind === 'release');
  const repos = [...new Set(events.filter((event) => ['commit', 'merged', 'release'].includes(event.kind)).map((event) => event.repo))];
  let best = null;
  for (const repo of repos) {
    const variants = releases.filter((event) => event.repo === repo);
    if (!variants.length) variants.push(null);
    for (const release of variants) {
      const candidates = events.filter((event) => event.repo === repo && (!release ||
        (event.at <= release.at && (event.kind === 'commit' ? release.commitIds?.includes(event.id) : event.kind === 'merged' ? release.prIds?.includes(event.id) : true))));
      const requirements = [metric(candidates, 'commits', 20, 'commits próprios na versão'), metric(candidates, 'days', 5, 'dias com commits'), metric(candidates, 'merged', 5, 'PRs próprios na versão'),
        { label: 'README não vazio na versão', current: release?.readme ? 1 : 0, target: 1, reachedAt: release?.readme ? release.at : null },
        { label: 'arquivo de implementação na versão', current: release?.implementation ? 1 : 0, target: 1, reachedAt: release?.implementation ? release.at : null },
        { label: 'release própria publicada', current: release ? 1 : 0, target: 1, reachedAt: release?.at || null }];
      const score = requirements.reduce((sum, item) => sum + Math.min(1, item.current / item.target), 0);
      if (!best || score > best.score) best = { requirements, score, repo };
    }
  }
  return best || { requirements: [metric([], 'commits', 20, 'commits próprios na versão'), metric([], 'days', 5, 'dias com commits'), metric([], 'merged', 5, 'PRs próprios na versão'), ...['README não vazio na versão', 'arquivo de implementação na versão', 'release própria publicada'].map((label) => ({ label, current: 0, target: 1, reachedAt: null }))] };
}
function evaluate(definition, window, events, startedAt) {
  const eligible = events.filter((event) => new Date(event.at) >= window.start && new Date(event.at) < window.end && new Date(event.at) >= new Date(startedAt));
  const project = definition.id === 'monthly-5' ? projectRequirements(eligible) : null;
  const requirements = project?.requirements || definition.requirements.map(([type, target, label]) => metric(eligible, type, target, label));
  const completedAt = requirements.every((item) => item.reachedAt) ? requirements.map((item) => item.reachedAt).sort().at(-1) : null;
  const progress = Math.round(requirements.reduce((sum, item) => sum + Math.min(1, item.current / item.target), 0) / requirements.length * 100);
  const next = requirements.find((item) => item.current < item.target);
  return { id: definition.id, number: definition.number, kind: definition.kind, xp: definition.xp, description: definition.description,
    periodKey: window.key, endsAt: window.end.toISOString(), requirements, progress, completedAt, repo: project?.repo || null,
    encouragement: completedAt ? 'Objetivo alcançado! Seu esforço virou progresso.' : `${progress >= 70 ? 'Quase lá! ' : 'Você pode avançar: '}${next.target - next.current === 1 ? 'falta' : 'faltam'} ${next.target - next.current} ${next.label}.` };
}
function activeMissions(events, startedAt, now = new Date()) {
  return definitions.map((definition) => evaluate(definition, windowFor(definition.kind, now), events, startedAt));
}
function claimCandidates(events, startedAt, now = new Date()) {
  const windows = new Map();
  for (let offset = 0; offset <= 2; offset += 1) for (const kind of ['daily', 'weekly', 'monthly']) {
    const window = windowFor(kind, new Date(now.getTime() - offset * DAY));
    if (window.end.getTime() + 2 * DAY >= now.getTime()) windows.set(`${kind}:${window.key}`, window);
  }
  return [...windows.values()].flatMap((window) => definitions.filter((definition) => definition.kind === window.kind)
    .map((definition) => evaluate(definition, window, events, startedAt))).filter((mission) => mission.completedAt);
}
module.exports = { definitions, windowFor, weekStart, activeMissions, claimCandidates, evaluate };
