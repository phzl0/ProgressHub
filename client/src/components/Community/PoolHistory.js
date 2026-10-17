import React from 'react';
export const poolStatus = { paid: 'Pago', validating: 'Em validação', paying: 'Pagamento em andamento', not_met: 'Meta não atingida' };
export default function PoolHistory({ history = [] }) {
  if (!history.length) return null;
  return <details className="ql-pool-history"><summary>Resultados dos bolões anteriores</summary><div className="ql-table-scroll"><table><caption className="ql-sr-only">Histórico dos bolões comunitários e seus bônus</caption><thead><tr><th>Semana UTC</th><th>Resultado</th><th>Contribuições</th><th>Seu bônus</th></tr></thead><tbody>{history.map(item => <tr key={item.periodKey}><td>{item.periodKey}</td><td>{poolStatus[item.status] || item.status}</td><td>{item.total}</td><td>{item.paid ? `+${item.xp.toLocaleString('pt-BR')} XP` : item.xp > 0 ? `${item.xp.toLocaleString('pt-BR')} XP ${item.estimated ? 'estimados' : 'pendentes'}` : '—'}</td></tr>)}</tbody></table></div></details>;
}
