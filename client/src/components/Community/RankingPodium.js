import React from 'react';
import { Trophy } from 'lucide-react';
import { CosmeticAvatar, CosmeticTitle, ProfileCard } from './Appearance';
export default function RankingPodium({ users }) {
  if (!users?.length) return null;
  return <ol className="ql-mini-podium" aria-label="Pódio dos três primeiros da temporada">{users.slice(0, 3).map((user, index) => {
    const frame = ['essential', 'circuit', 'terminal', 'crystal', 'prestige'].includes(user.appearance?.frame) ? user.appearance.frame : 'essential';
    return <ProfileCard as="li" appearance={user.appearance} rank={index+1} key={user.githubId} className={`ql-mini-podium-place ql-mini-place-${index + 1} ql-mini-frame-${frame}`} aria-label={`${index + 1}º lugar: ${user.githubLogin}`}>
      <div className="ql-mini-podium-player"><CosmeticAvatar src={user.picture} appearance={user.appearance} frame={frame} size={48} /><a href={`#profile/${user.githubId}`} title={`Ver perfil de @${user.githubLogin}`}>@{user.githubLogin}</a><small>{user.career?.title || user.githubStats.title} · LVL {user.career?.level || user.githubStats.level}</small><div className="ql-mini-podium-title"><CosmeticTitle appearance={user.appearance} title={user.appearance?.title} /></div><strong>{(user.githubStats.xp || 0).toLocaleString('pt-BR')} <span>XP</span></strong></div>
      <div className="ql-mini-podium-step"><Trophy size={14} aria-hidden="true" /><span>{index + 1}º</span></div>
    </ProfileCard>;
  })}</ol>;
}
