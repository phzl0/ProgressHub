import React from 'react';

const dateLabel = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export default function ScoreDetails({ stats }) {
  if (!stats) return null;
  if (!stats.breakdown) {
    return <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6"><h2 className="text-xl font-semibold">De onde veio seu XP?</h2><p className="mt-3 text-slate-400">Sincronize o GitHub para carregar o detalhamento da sua pontuação. Se acabou de sincronizar, aguarde o intervalo de cinco minutos.</p></section>;
  }
  const { breakdown, commitDays = [], pullRequests = [] } = stats;
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 space-y-6" aria-labelledby="score-details-title">
      <div><h2 id="score-details-title" className="text-xl font-semibold">De onde veio seu XP?</h2><p className="text-sm text-slate-400 mt-1">Contribuições reconhecidas no mês {stats.period}. Dados da última sincronização; dias em UTC.</p></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-900 p-4"><h3 className="font-semibold">Commits · {breakdown.commitXP} XP</h3><p className="text-sm text-slate-300 mt-2">{breakdown.detectedCommits} detectados · {stats.commits} pontuados × 10 XP</p><p className="text-xs text-slate-400 mt-2">{breakdown.ignoredCommits} acima do limite de 20 commits por dia.</p></div>
        <div className="rounded-xl bg-slate-900 p-4"><h3 className="font-semibold">PRs mesclados · {breakdown.pullRequestXP} XP</h3><p className="text-sm text-slate-300 mt-2">{breakdown.detectedMergedPRs} detectados · {stats.mergedPRs} pontuados × 50 XP</p><p className="text-xs text-slate-400 mt-2">{breakdown.ignoredMergedPRs} acima do limite de 100 PRs por mês.</p></div>
      </div>
      <details className="rounded-xl border border-slate-700 p-4">
        <summary className="cursor-pointer font-semibold">Commits por dia ({commitDays.length} dias com contribuições)</summary>
        <p className="text-xs text-slate-400 my-3">Resumo por dia dos commits reconhecidos pelo GitHub, sem lista individual de commits. Os limites são aplicados à soma de todos os repositórios.</p>
        {commitDays.length === 0 ? <p className="text-sm text-slate-400">Nenhum commit elegível reconhecido neste mês.</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="sr-only">Detalhamento diário dos commits e XP da temporada atual</caption><thead className="text-slate-400"><tr><th scope="col" className="py-2 pr-4">Dia UTC</th><th scope="col" className="pr-4">Detectados</th><th scope="col" className="pr-4">Pontuados</th><th scope="col">XP</th></tr></thead><tbody className="divide-y divide-slate-700">{commitDays.map((day) => <tr key={day.date}><th scope="row" className="py-3 pr-4 font-normal"><time dateTime={day.date}>{dateLabel(day.date)}</time></th><td>{day.detected}</td><td>{day.credited}</td><td className="text-indigo-300">+{day.xp}</td></tr>)}</tbody></table></div>}
      </details>
      <details className="rounded-xl border border-slate-700 p-4">
        <summary className="cursor-pointer font-semibold">PRs públicos mesclados ({pullRequests.length} exibidos)</summary>
        <p className="text-xs text-slate-400 my-3">Até 100 resultados retornados pela busca do GitHub. Esta lista é uma referência das contribuições; o total mensal acima é a base do cálculo, limitado a 100 PRs.</p>
        {pullRequests.length === 0 ? <p className="text-sm text-slate-400">Nenhum PR público mesclado encontrado neste mês.</p> : <ul className="divide-y divide-slate-700">{pullRequests.map((pr) => <li key={pr.url} className="py-3"><a href={pr.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-300 hover:underline break-words">{pr.title}</a><p className="text-xs text-slate-400 mt-1">{pr.repository} · mesclado em <time dateTime={pr.mergedAt}>{dateLabel(pr.mergedAt)} UTC</time></p></li>)}</ul>}
      </details>
      <p className="text-xs text-slate-400">Este detalhamento é um retrato do mês atual, não um histórico de temporadas anteriores. Contribuições excluídas ou reclassificadas pelo GitHub podem alterar o total na próxima sincronização.</p>
    </section>
  );
}
