import React from 'react';
import { CalendarDays, Zap } from 'lucide-react';
import useCommunityData from './useCommunityData';
export default function WeeklySummary({ connected, revision }) {
  const { data, error } = useCommunityData('/weekly-summary', connected, revision);
  if (!connected) return null;
  const number = value => (value || 0).toLocaleString('pt-BR');
  return <section className="ql-panel ql-week-summary"><div className="ql-panel-head"><div><p className="ql-eyebrow">CADA SEMANA CONTA</p><h2><CalendarDays size={19} /> Seu resumo semanal</h2></div>{data && <span className="ql-tag">DESDE {new Date(data.startsAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} · UTC</span>}</div>
    {error && <p className="ql-error" role="alert">{error}</p>}{!data && !error && <p role="status">Carregando resumo…</p>}
    {data && <><div className="ql-week-total"><Zap size={22} /><strong>{number(data.xp)} XP</strong><span>{number(data.commitXP + data.prXP)} de ações + {number(data.bonusXP)} de bônus recebidos</span></div><div className="ql-week-stats">{[['Commits pontuados', data.commits], ['PRs mesclados', data.mergedPRs], ['Dias com commits', data.activeDays], ['PRs revisados', data.reviews], ['Missões recebidas', data.receivedMissions]].map(([label, count]) => <div key={label}><strong>{number(count)}</strong><span>{label}</span></div>)}</div><p className="ql-caption">{data.xp ? 'Seu trabalho está deixando uma marca. Continue no seu ritmo.' : 'Uma nova semana para construir. Sua próxima contribuição pode ser o primeiro passo.'} Ações são agrupadas pela data em que ocorreram; bônus, pela data do recebimento. Valores refletem as evidências salvas.</p>{data.communityBonusXP > 0 && <p className="ql-caption">Inclui {number(data.communityBonusXP)} XP recebidos de bolões comunitários.</p>}{data.partial && <p className="ql-caption">Resumo parcial: parte do histórico ainda não está disponível ou validada.</p>}</>}
  </section>;
}
