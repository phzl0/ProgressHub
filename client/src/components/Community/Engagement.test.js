import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PersonalGoals from './PersonalGoals';
import WeeklySummary from './WeeklySummary';
import CommunityChallenge from './CommunityChallenge';
import ProjectShowcase from './ProjectShowcase';
const goalData = { templates: [{ id: 'commerce', title: 'E-commerce', description: 'Construa uma loja', steps: ['Planejar', 'Entregar'] }], goal: null, history: [] };
afterEach(() => { delete global.fetch; });
test('suggested project persists its roadmap and marks stages as self-reported progress', async () => {
  let goal = null;
  global.fetch = jest.fn(async (url, options) => {
    if (options?.method === 'POST') {
      if (url.endsWith('/update')) goal = { ...goal, steps: [{ id: '1', label: 'Planejar', done: true }, { id: '2', label: 'Entregar', done: false }], current: 1, progress: 50, version: 2 };
      else goal = { id: 'goal', title: 'E-commerce', description: 'Construa uma loja', steps: [{ id: '1', label: 'Planejar', done: false }, { id: '2', label: 'Entregar', done: false }], current: 0, target: 2, progress: 0, status: 'active', version: 1 };
    }
    return { ok: true, json: async () => ({ ...goalData, goal }) };
  });
  render(<PersonalGoals connected />);
  fireEvent.click(await screen.findByRole('button', { name: 'Começar projeto' }));
  expect(await screen.findByRole('progressbar', { name: 'Progresso da meta pessoal' })).toHaveAttribute('aria-valuenow', '0');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Planejar' }));
  await screen.findByText('1/2 etapas');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  const post = global.fetch.mock.calls.find(([url, options]) => url.endsWith('/update') && options.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual({ goalId: 'goal', version: 1, action: 'step', stepId: '1', done: true });
});
test('custom goal allows a title, free deadline and user-defined stages', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => goalData }));
  render(<PersonalGoals connected />);
  fireEvent.click(await screen.findByRole('button', { name: 'Meta própria' }));
  fireEvent.change(screen.getByLabelText('Título da meta'), { target: { value: 'Sistema de estoque' } });
  fireEvent.change(screen.getByLabelText(/Etapas da meta/), { target: { value: 'Modelar produtos\nTestar saldo' } });
  fireEvent.change(screen.getByLabelText(/Prazo desejado/), { target: { value: '2026-12-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'Começar projeto' }));
  await screen.findByRole('button', { name: 'Começar projeto' });
  const post = global.fetch.mock.calls.find(([, options]) => options.method === 'POST');
  expect(JSON.parse(post[1].body)).toMatchObject({ mode: 'custom', title: 'Sistema de estoque', steps: ['Modelar produtos', 'Testar saldo'], dueDate: '2026-12-31' });
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

test('community pool shows a conditional proportional estimate and previous payment', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ current: 100, target: 100, poolXP: 40000, progress: 100, participants: 3, mine: 30, me: { estimatedXP: 12000, percentage: 30 }, completed: true, optedIn: true, endsAt: '2026-10-19T00:00:00Z', closesAt: '2026-10-21T00:00:00Z', history: [{ periodKey: '2026-10-05', status: 'paid', total: 200, xp: 5000, paid: true }] }) }));
  render(<CommunityChallenge />);
  expect(await screen.findByText('40.000 XP')).toBeInTheDocument();
  expect(screen.getByText('12.000 XP')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Resultados dos bolões anteriores'));
  expect(screen.getByText('+5.000 XP')).toBeInTheDocument();
  expect(screen.getByText(/A meta coletiva precisa ser atingida/)).toBeInTheDocument();
});
