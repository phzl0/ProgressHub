import React, { useState } from 'react';
import { Users, Flag, CheckCircle2, ArrowUpRight, Zap, ChevronDown } from 'lucide-react';
import useCommunityData from './useCommunityData';
import PoolHistory from './PoolHistory';
export default function CommunityChallenge({ revision }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useCommunityData('/challenge', open, revision);
  const number = value => (value || 0).toLocaleString('pt-BR');
  return <section className={`ql-community-disclosure${open ? ' is-open' : ''}`}>
    <button className="ql-community-banner" aria-expanded={open} aria-controls="community-pool-details" onClick={() => setOpen(value => !value)}><Users size={21} /><span><strong>Desafio da comunidade</strong><small>Bolão de {number(data?.poolXP || 40000)} XP · veja como participar</small></span><ChevronDown size={18} /></button>
    {open && <div id="community-pool-details" className="ql-panel ql-community-challenge"><div className="ql-challenge-symbol"><Users size={34} /></div><div className="ql-challenge-body"><div className="ql-panel-head"><span className="ql-tag ql-green-tag"><Flag size={13} /> DESAFIO DA COMUNIDADE</span>{data?.completed && <span className="ql-goal-status"><CheckCircle2 size={16} /> Alcançado!</span>}</div><h2>Juntos, construímos mais.</h2><p className="ql-muted">Nossa meta: 100 commits públicos elegíveis nesta semana.</p>
    {error && <p role="alert" className="ql-error">{error}</p>}{!data && !error && <p className="ql-caption" role="status">Consultando o esforço coletivo…</p>}
    {data && <><div className="ql-pool-prize"><Zap size={23} /><strong>{number(data.poolXP || 40000)} XP</strong><span>bolão dividido proporcionalmente entre os participantes</span></div><div className="ql-challenge-count"><strong>{number(data.current)}<span> / {data.target}</span></strong><span>{data.participants} participantes contribuíram</span></div><div className="ql-xp-track" role="progressbar" aria-label="Progresso do desafio da comunidade" aria-valuenow={data.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${data.progress}%` }} /></div>
      <div className="ql-pool-estimate"><div><small>SUA CONTRIBUIÇÃO</small><strong>{number(data.mine)} commits</strong></div><div><small>SUA PARTE ESTIMADA</small><strong>{number(data.me?.estimatedXP)} XP</strong><span>{(data.me?.percentage || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do total</span></div></div>
      <p className="ql-caption">{data.optedIn ? `Você já contribuiu com ${data.mine} commits. Cada passo ajuda a comunidade!` : data.mine > 0 ? 'Suas contribuições registradas foram preservadas. Ative a participação pública para somar novas ações.' : 'Ative sua participação pública no ranking para somar suas contribuições.'} Encerra em {new Date(data.endsAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. {data.status === 'validating' ? 'Resultado em validação.' : 'A estimativa pode mudar até o fechamento.'}</p>
      {!data.optedIn && <a className="ql-text-link" href="#ranking">Participar da comunidade <ArrowUpRight size={15} /></a>}
      <details className="ql-pool-rules"><summary>Como o bolão funciona</summary><p className="ql-caption">A meta coletiva precisa ser atingida para liberar o prêmio. Todas as contribuições elegíveis até o prazo entram na proporção, mesmo depois de alcançar 100. Pagamento automático após 48 horas de validação, inclusive com um único participante. O bônus entra na carreira e no ranking global, no mês do crédito.</p><p className="ql-caption">XP inteiro, arredondado para baixo: contribuições iguais recebem o mesmo bônus; o saldo de arredondamento não é distribuído. Só contam ações enquanto sua participação estava ativa, a partir de {data.startsAt ? new Date(data.startsAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : 'sua entrada'}. A coleta pode ser parcial; apenas dados confirmados antes do fechamento entram. O serviço automático precisa estar em execução para pagar.</p>{data.closesAt && <p className="ql-caption">Fechamento previsto: {new Date(data.closesAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.</p>}</details>
      <PoolHistory history={data.history} />
    </>}
    <a className="ql-text-link" href="#ranking/community">Ver ranking comunitário <ArrowUpRight size={15} /></a>
  </div></div>}
  </section>;
}
