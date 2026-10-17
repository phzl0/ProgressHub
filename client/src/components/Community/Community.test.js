import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import Community from './Community';

const snapshot = new Date('2026-10-16T12:00:00Z');
let syncCount;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(snapshot);
  window.history.replaceState(null, '', '/community');
  localStorage.clear();
  syncCount = 0;
  global.fetch = jest.fn(async (url) => {
    const stats = {
      xp: 200, level: 2, experience: 0, nextLevelXP: 400,
      commits: 20, mergedPRs: 0, title: 'Explorador', period: '2026-10',
      syncedAt: snapshot.toISOString(), achievements: [], commitDays: [],
      breakdown: { commitXP: 200, pullRequestXP: 0, detectedCommits: 20,
        detectedMergedPRs: 0, ignoredCommits: 0, ignoredMergedPRs: 0 }
    };
    if (url.endsWith('/sync')) syncCount += 1;
    if (url.endsWith('/community-ranking')) return { ok: true, json: async () => ({ users: [], participants: 0, total: 0, me: null, endsAt: '2026-10-19T00:00:00Z' }) };
    if (url.endsWith('/challenge')) return { ok: true, json: async () => ({ current: 7, target: 100, progress: 7, participants: 2, mine: 3, optedIn: true, endsAt: '2026-10-19T00:00:00Z' }) };
    if (url.endsWith('/weekly-summary')) return { ok: true, json: async () => ({ startsAt: '2026-10-12T00:00:00Z', xp: 200, commitXP: 200, prXP: 0, bonusXP: 0, commits: 20, activeDays: 2, mergedPRs: 0, reviews: 0, receivedMissions: 0 }) };
    if (url.endsWith('/goals')) return { ok: true, json: async () => ({ templates: [], goal: null, history: [] }) };
    return { ok: true, json: async () => url.endsWith('/leaderboard')
      ? { period: '2026-10', users: [] }
      : url.endsWith('/missions') ? { startedAt: snapshot.toISOString(), missions: ['daily', 'weekly', 'monthly'].flatMap((kind) => Array.from({ length: 5 }, (_, index) => ({ id: `${kind}-${index+1}`, number: index+1, kind, xp: kind === 'monthly' ? 2000 : 300, description: `Objetivo ${kind} ${index+1}`, periodKey: '2026-10', endsAt: '2026-11-01T00:00:00Z', requirements: [{ label: 'commits', current: 0, target: 1 }], progress: 0, encouragement: 'Você está perto do próximo passo.', awarded: false }))) }
      : url.endsWith('/seasons') ? { seasons: [{ period: '2026-09', xp: 200, status: 'closed', position: 3, participants: 12, completeness: 'partial' }] }
      : url.includes('/profiles/') ? { githubId: '42', login: 'peer', picture: '', stats, position: 3 }
      : url.endsWith('/me') ? { connected: true, login: 'developer', optedIn: true, position: 1, stats }
      : stats };
  });
});
afterEach(async () => { await act(async () => {}); cleanup(); jest.useRealTimers(); delete global.fetch; });

test('dashboard, progress and ranking occupy separate views', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  expect(screen.getByRole('heading', { name: 'Top 10 de carreira' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Classificação global' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Progresso', exact: true }));
  expect(screen.getByRole('heading', { name: 'Seu ritmo de contribuição' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Top 10 de carreira' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Ranking', exact: true }));
  expect(screen.getByRole('heading', { name: 'Classificação global' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Seu ritmo de contribuição' })).not.toBeInTheDocument();
});
test('automatic GitHub synchronization waits ten minutes', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  expect(syncCount).toBe(0);
  const remaining = 600000 - (Date.now() - snapshot.getTime());
  await act(async () => { jest.advanceTimersByTime(remaining - 1); });
  expect(syncCount).toBe(0);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(syncCount).toBe(1);
});


test('public profile supports a direct link inside the community', async () => {
  window.history.replaceState(null, '', '/community#profile/42');
  await act(async () => { render(<Community />); });
  await screen.findByRole('heading', { name: '@peer' });
  expect(screen.getByRole('link', { name: /Ver no GitHub/ })).toHaveAttribute('href', 'https://github.com/peer');
  expect(screen.getByText('#3')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Dashboard', exact: true })); });
  expect(screen.getByRole('heading', { name: 'Top 10 de carreira' })).toBeInTheDocument();
});

test('an unavailable public profile does not render participant details', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => url.includes('/profiles/')
    ? Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Perfil indisponível.' }) })
    : normalFetch(url, options));
  window.history.replaceState(null, '', '/community#profile/42');
  await act(async () => { render(<Community />); });
  await screen.findByRole('heading', { name: 'Perfil indisponível' });
  expect(screen.queryByRole('link', { name: /Ver no GitHub/ })).not.toBeInTheDocument();
});


test('season history keeps final standings and labels partial records', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  fireEvent.click(screen.getByRole('link', { name: 'Temporadas', exact: true }));
  await screen.findByText('2026-09');
  expect(screen.getByText('#3 de 12')).toBeInTheDocument();
  expect(screen.getByText('Histórico parcial')).toBeInTheDocument();
});

test('career remains visible when the new season has no snapshot yet', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => url.endsWith('/me')
    ? Promise.resolve({ ok: true, json: async () => ({ connected: true, login: 'developer', stats: null,
      career: { xp: 1200, level: 4, experience: 0, nextLevelXP: 800, title: 'Explorador', achievements: ['Primeiro commit'] } }) })
    : normalFetch(url, options));
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  expect(screen.getByText('CARREIRA PERMANENTE')).toBeInTheDocument();
  expect(screen.getByText('1.200')).toBeInTheDocument();
  expect(screen.getByText('Nível 4')).toBeInTheDocument();
});


test('missions show five numbered cards per frequency without invented names', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  fireEvent.click(screen.getByRole('link', { name: 'Missões', exact: true }));
  await screen.findByText('Objetivo daily 1');
  expect(screen.getAllByText(/^MISSÃO [1-5]$/)).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: /Semanais/ }));
  expect(screen.getByText('Objetivo weekly 5')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Mensais/ }));
  expect(screen.getByText('Objetivo monthly 5')).toBeInTheDocument();
  expect(screen.getAllByText('Você está perto do próximo passo.')).toHaveLength(5);
});

test('my profile groups career, achievements and links to mission progression', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  fireEvent.click(screen.getByRole('link', { name: 'Meu perfil', exact: true }));
  expect(screen.getByRole('heading', { name: 'Minha coleção de conquistas' })).toBeInTheDocument();
  expect(screen.getByText('XP de carreira')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Ganhar bônus nas missões/ })).toHaveAttribute('href', '#missions');
});

test('ranking switches between global XP and community contribution without mixing standings', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  fireEvent.click(screen.getByRole('link', { name: 'Ranking', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Comunitário' }));
  expect(await screen.findByRole('heading', { name: 'Classificação comunitária' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Classificação global' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Global', exact: true }));
  expect(screen.getByRole('heading', { name: 'Classificação global' })).toBeInTheDocument();
});

test('update control is compact and the large synchronization notice is absent', async () => {
  await act(async () => { render(<Community />); });
  await screen.findByText('@developer');
  expect(screen.getByRole('button', { name: 'Atualizar contribuições' })).toBeInTheDocument();
  expect(screen.queryByText(/Pontuação, atividades e ranking atualizados/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Ranking consultado às/)).not.toBeInTheDocument();
});

test('navigation collapses, retains accessible links and remembers the preference', async () => {
  let view;
  await act(async () => { view = render(<Community />); });
  await screen.findByText('@developer');
  fireEvent.click(screen.getByRole('button', { name: 'Recolher navegação' }));
  expect(screen.getByRole('button', { name: 'Expandir navegação' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('link', { name: 'Metas pessoais' })).toHaveAttribute('title', 'Metas pessoais');
  view.unmount();
  await act(async () => { render(<Community />); });
  expect(screen.getByRole('button', { name: 'Expandir navegação' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expandir navegação' }));
  expect(localStorage.getItem('ql-navigation-collapsed')).toBe('false');
});

test('career leaders use their own total and footer information keeps the current view', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => url.endsWith('/career-leaderboard')
    ? Promise.resolve({ ok: true, json: async () => ({ users: [{ githubId: '99', githubLogin: 'veteran', career: { xp: 12500, level: 11, title: 'Veterano' } }] }) })
    : normalFetch(url, options));
  await act(async () => { render(<Community />); });
  expect(await screen.findByRole('link', { name: '@veteran' })).toHaveAttribute('href', '#profile/99');
  expect(screen.getByText('12.500 XP')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Privacidade' }));
  expect(screen.getByRole('heading', { name: 'Privacidade' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Top 10 de carreira' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar informações' }));
  expect(screen.queryByRole('heading', { name: 'Privacidade' })).not.toBeInTheDocument();
});
