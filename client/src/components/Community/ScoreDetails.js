import React from 'react';
const dateLabel = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export default function ScoreDetails({ stats }) {
  if (!stats?.breakdown) return <section className="ql-panel"><h2>Detalhamento de XP</h2><p className="ql-muted">Os detalhes aparecerão após a próxima sincronização com o GitHub.</p></section>;
  const { breakdown, commitDays = [], pullRequests = [] } = stats;
  return <section className="ql-panel ql-score-details" aria-labelledby="score-details-title">
    <div className="ql-panel-head"><div><p className="ql-eyebrow">EXTRATO DA TEMPORADA</p><h2 id="score-details-title">Cada contribuição conta.</h2></div><span className="ql-tag">{stats.period} · UTC</span></div>
    <div className="ql-split">
      <div className="ql-inset"><span className="ql-muted">Commits</span><strong>{breakdown.commitXP.toLocaleString('pt-BR')} <small>XP</small></strong><p>{breakdown.detectedCommits} detectados · {stats.commits} pontuados × 10 XP</p><span className="ql-caption">{breakdown.ignoredCommits} acima do limite diário.</span></div>
      <div className="ql-inset"><span className="ql-muted">PRs mesclados</span><strong>{breakdown.pullRequestXP.toLocaleString('pt-BR')} <small>XP</small></strong><p>{breakdown.detectedMergedPRs} detectados · {stats.mergedPRs} pontuados × 50 XP</p><span className="ql-caption">{breakdown.ignoredMergedPRs} acima do limite mensal.</span></div>
    </div>
    <details open><summary>Commits por dia <span>{commitDays.length} dias ativos</span></summary>
      <p className="ql-caption">Os limites são aplicados à soma dos repositórios em cada dia UTC.</p>
      {!commitDays.length ? <p className="ql-empty">Nenhum commit elegível neste mês. Sua jornada está começando.</p> : <div className="ql-table-scroll"><table><caption className="ql-sr-only">Commits diários e XP do mês atual</caption><thead><tr><th scope="col">Dia UTC</th><th scope="col">Detectados</th><th scope="col">Pontuados</th><th scope="col">XP ganho</th></tr></thead><tbody>{commitDays.map((day) => <tr key={day.date}><th scope="row"><time dateTime={day.date}>{dateLabel(day.date)}</time></th><td>{day.detected}</td><td>{day.credited}</td><td className="ql-green">+{day.xp} XP</td></tr>)}</tbody></table></div>}
    </details>
    <details><summary>PRs públicos mesclados <span>{pullRequests.length} exibidos</span></summary><p className="ql-caption">Até 100 resultados da busca, como referência. O cálculo usa o total mensal, limitado a 100 PRs.</p>
      {!pullRequests.length ? <p className="ql-empty">Seus PRs mesclados aparecerão aqui.</p> : <ul className="ql-pr-list">{pullRequests.map((pr) => <li key={pr.url}><a href={pr.url} target="_blank" rel="noreferrer">{pr.title} ↗</a><p className="ql-caption">{pr.repository} · <time dateTime={pr.mergedAt}>{dateLabel(pr.mergedAt)} UTC</time></p></li>)}</ul>}
    </details>
    <p className="ql-caption">Retrato do mês atual. Mudanças nas contribuições reconhecidas pelo GitHub podem alterar o total.</p>
  </section>;
}
