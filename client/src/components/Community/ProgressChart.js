import React from 'react';

export default function ProgressChart({ stats }) {
  const period = stats?.period || new Date().toISOString().slice(0, 7);
  const snapshot = stats?.syncedAt ? new Date(stats.syncedAt) : new Date();
  const count = snapshot.toISOString().startsWith(period) ? snapshot.getUTCDate() : 31;
  const values = Array.from({ length: count }, (_, index) => {
    const date = `${period}-${String(index + 1).padStart(2, '0')}`;
    return { day: index + 1, xp: stats?.commitDays?.find((entry) => entry.date === date)?.xp || 0 };
  });
  const max = Math.max(50, ...values.map((value) => value.xp));
  const point = (value, index) => [42 + index * 620 / Math.max(1, count - 1), 170 - value.xp / max * 130];
  const points = values.map(point);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const ticks = [...new Set([1, Math.ceil(count / 2), count])];
  return <div className="ql-chart">
    <svg viewBox="0 0 700 210" role="img" aria-label={`XP diário de commits em ${period}. Total de ${stats?.breakdown?.commitXP || 0} XP.`}>
      <defs><linearGradient id="commit-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a3e635" stopOpacity="0.22" /><stop offset="100%" stopColor="#a3e635" stopOpacity="0" /></linearGradient></defs>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1="42" x2="662" y1={170 - fraction * 130} y2={170 - fraction * 130} stroke="#242c25" strokeDasharray="4 5" /><text x="30" y={174 - fraction * 130} textAnchor="end">{Math.round(max * fraction)}</text></g>)}
      <path d={`${path} L ${points[points.length - 1][0]} 170 L 42 170 Z`} fill="url(#commit-area)" />
      <path d={path} fill="none" stroke="#a3e635" strokeWidth="3" strokeLinejoin="round" />
      {values.map((value, index) => <circle key={value.day} cx={points[index][0]} cy={points[index][1]} r={value.xp ? 4 : 2} fill={value.xp ? '#a3e635' : '#414c40'}><title>Dia {value.day}: {value.xp} XP em commits</title></circle>)}
      {ticks.map((day) => <text key={day} x={42 + (day - 1) * 620 / Math.max(1, count - 1)} y="197" textAnchor="middle">{String(day).padStart(2, '0')}</text>)}
    </svg>
    <p className="ql-caption">Dias do mês em UTC · somente XP de commits; PRs aparecem no detalhamento.</p>
  </div>;
}
