import React, { useEffect, useState } from 'react';
import { History, Trophy } from 'lucide-react';
const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
export default function SeasonHistory({ connected, career }) {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    let mounted = true;
    const controller = new AbortController();
    async function load() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(`${API}/seasons`, { credentials: 'include', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as temporadas.');
        if (mounted) { setSeasons(data.seasons); setError(''); }
      } catch (err) { if (mounted && err.name !== 'AbortError') setError(err.message); }
      finally { if (mounted) setLoading(false); }
    }
    load(); const timer = window.setInterval(load, 600000);
    const resume = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [connected]);
  if (!connected) return <section className="ql-panel ql-empty"><History size={32} /><h2>Sua história começa ao conectar o GitHub.</h2><p>Entre para acompanhar os resultados de cada temporada.</p></section>;
  return <section className="ql-panel"><div className="ql-panel-head"><div><p className="ql-eyebrow">SUA EVOLUÇÃO FICA</p><h2>Histórico de temporadas</h2></div><span className="ql-tag ql-gold-tag"><Trophy size={13} />Melhor posição: {career?.bestPosition ? `#${career.bestPosition}` : 'a conquistar'}</span></div>
    <p className="ql-muted">A carreira acumula XP. A disputa mensal começa de novo. Os resultados são fechados após uma janela de 48 horas para reconciliar o mês anterior.</p>
    {loading && <p role="status" className="ql-empty">Carregando temporadas…</p>}{error && <p className="ql-error" role="alert">{error}</p>}
    {!loading && !seasons.length && <p className="ql-empty">Ainda não há temporadas registradas. Sua primeira sincronização iniciará o histórico.</p>}
    {seasons.length > 0 && <div className="ql-table-scroll"><table><caption className="ql-sr-only">Seu histórico de pontuação e classificação por mês</caption><thead><tr><th>Temporada</th><th>XP</th><th>Posição final</th><th>Situação</th><th>Cobertura</th></tr></thead><tbody>{seasons.map((season) => <tr key={season.period}><th scope="row">{season.period}</th><td className="ql-green">{season.xp.toLocaleString('pt-BR')}</td><td>{season.position ? `#${season.position} de ${season.participants}` : season.status === 'closed' ? 'Sem classificação' : 'Em disputa'}</td><td><span className="ql-tag">{season.status === 'closed' ? 'Encerrada' : season.status === 'pending' ? 'Aguardando fechamento' : 'Em andamento'}</span></td><td><span className="ql-caption" title={season.note}>{season.completeness === 'partial' ? 'Histórico parcial' : season.completeness === 'reconciled' ? 'Reconciliada com GitHub' : 'Em acompanhamento'}</span></td></tr>)}</tbody></table></div>}
    <p className="ql-caption" style={{ marginTop: 18 }}>Histórico parcial significa que não acompanhamos todos os dados desde o início ou que uma consulta de fechamento falhou. Não inventamos meses ou posições anteriores. As posições consideram apenas participantes registrados naquele fechamento. Resultados encerrados não são recalculados. Seu histórico é privado.</p>
  </section>;
}
