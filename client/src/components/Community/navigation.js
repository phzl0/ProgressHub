import { House, Trophy, ScrollText, ChartNoAxesCombined, Target, MessagesSquare } from 'lucide-react';
export const PRIMARY_NAVIGATION = [
  { id: 'dashboard', path: 'home', label: 'Tela inicial', icon: House },
  { id: 'ranking', path: 'ranking', label: 'Ranking', icon: Trophy },
  { id: 'missions', path: 'missions', label: 'Missões', icon: ScrollText },
  { id: 'progress', path: 'progress', label: 'Progresso', icon: ChartNoAxesCombined },
  { id: 'goals', path: 'goals', label: 'Metas pessoais', icon: Target },
  { id: 'community', path: 'community', label: 'Comunidade', icon: MessagesSquare }
];
export const PAGE_LABELS = { dashboard: 'Tela inicial', ranking: 'Ranking', missions: 'Missões', progress: 'Progresso', goals: 'Metas pessoais', community: 'Comunidade', me: 'Meu perfil', profile: 'Perfil público', seasons: 'Temporadas', achievements: 'Conquistas', settings: 'Configurações', account: 'Conta', privacy: 'Privacidade', information: 'Regras e ajuda' };
export function viewFromHash(hash = window.location.hash) {
  const path = hash.replace(/^#/, '');
  if (/^profile\/\d{1,20}$/.test(path)) return 'profile';
  if (path === 'ranking/community') return 'ranking';
  if (path === 'ranking/seasons') return 'seasons';
  if (path === 'progress/achievements') return 'achievements';
  if (path === 'home') return 'dashboard';
  return path !== 'profile' && Object.hasOwn(PAGE_LABELS, path) ? path : 'dashboard';
}
export const parentView = tab => tab === 'seasons' ? 'ranking' : tab === 'achievements' ? 'progress' : tab;
