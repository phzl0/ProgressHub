import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PersonalGoals from './PersonalGoals';
import WeeklySummary from './WeeklySummary';
import CommunityChallenge from './CommunityChallenge';
import ProjectShowcase from './ProjectShowcase';
const goalData = { options: [{ id: 'days', label: 'Programar em dias diferentes', unit: 'dias com commits', max: 7, suggested: 3 }], goal: null, endsAt: '2026-10-19T00:00:00Z' };
afterEach(() => { delete global.fetch; });
test('choosing a personal goal persists it and replaces the form with verified progress', async () => {
  global.fetch = jest.fn(async (url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { ...goalData, goal: { metric: 'days', label: 'Programar em dias diferentes', target: 3, current: 0, progress: 0, unit: 'dias com commits', createdAt: '2026-10-16T12:00:00Z', endsAt: goalData.endsAt } } : goalData }));
  render(<PersonalGoals connected />);
  fireEvent.click(await screen.findByRole('button', { name: 'Assumir minha meta' }));
  expect(await screen.findByRole('progressbar', { name: 'Progresso da meta pessoal' })).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByRole('button', { name: 'Assumir minha meta' })).not.toBeInTheDocument();
  const post = global.fetch.mock.calls.find(([, options]) => options.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual({ metric: 'days', target: 3 });
});
test('weekly summary explains action XP, received bonuses and incomplete coverage', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ startsAt: '2026-10-12T00:00:00Z', xp: 475, commitXP: 50, prXP: 125, bonusXP: 300, commits: 5, mergedPRs: 2, activeDays: 2, reviews: 1, receivedMissions: 1, partial: true }) }));
  render(<WeeklySummary connected />);
  expect(await screen.findByText('475 XP')).toBeInTheDocument();
  expect(screen.getByText('175 de ações + 300 de bônus recebidos')).toBeInTheDocument();
  expect(screen.getByText(/Resumo parcial/)).toBeInTheDocument();
});
test('community challenge highlights the shared objective and shows personal participation', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ current: 100, target: 100, progress: 100, participants: 10, mine: 3, completed: true, optedIn: true, endsAt: '2026-10-19T00:00:00Z' }) }));
  render(<CommunityChallenge />);
  expect(await screen.findByText('Alcançado!')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  expect(screen.getByText(/Você já contribuiu com 3 commits/)).toBeInTheDocument();
});
test('project showcase renders selected icons and safe external links without claiming completion', () => {
  render(<ProjectShowcase projects={[{ name: 'Meu app', description: 'Ferramenta open source', url: 'https://github.com/user/app', icon: 'fire' }]} />);
  expect(screen.getByRole('link', { name: /Meu app/ })).toHaveAttribute('href', 'https://github.com/user/app');
  expect(screen.getByText(/não concede XP/)).toBeInTheDocument();
});
