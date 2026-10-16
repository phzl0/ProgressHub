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
    return { ok: true, json: async () => url.endsWith('/leaderboard')
      ? { period: '2026-10', users: [] }
      : url.includes('/profiles/') ? { githubId: '42', login: 'peer', picture: '', stats, position: 3 }
      : url.endsWith('/me') ? { connected: true, login: 'developer', optedIn: true, position: 1, stats }
      : stats };
  });
});
afterEach(() => { cleanup(); jest.useRealTimers(); delete global.fetch; });

test('dashboard, progress and ranking occupy separate views', async () => {
  render(<Community />);
  await screen.findByText('@developer');
  expect(screen.getByRole('heading', { name: 'Suas conquistas' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Classificação global' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Progresso', exact: true }));
  expect(screen.getByRole('heading', { name: 'Seu ritmo de contribuição' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Suas conquistas' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Ranking', exact: true }));
  expect(screen.getByRole('heading', { name: 'Classificação global' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Seu ritmo de contribuição' })).not.toBeInTheDocument();
});
test('automatic GitHub synchronization waits ten minutes', async () => {
  render(<Community />);
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
  render(<Community />);
  await screen.findByRole('heading', { name: '@peer' });
  expect(screen.getByRole('link', { name: /Ver no GitHub/ })).toHaveAttribute('href', 'https://github.com/peer');
  expect(screen.getByText('#3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Dashboard', exact: true }));
  expect(screen.getByRole('heading', { name: 'Suas conquistas' })).toBeInTheDocument();
});

test('an unavailable public profile does not render participant details', async () => {
  const normalFetch = global.fetch;
  global.fetch = jest.fn((url, options) => url.includes('/profiles/')
    ? Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Perfil indisponível.' }) })
    : normalFetch(url, options));
  window.history.replaceState(null, '', '/community#profile/42');
  render(<Community />);
  await screen.findByRole('heading', { name: 'Perfil indisponível' });
  expect(screen.queryByRole('link', { name: /Ver no GitHub/ })).not.toBeInTheDocument();
});
