import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import Achievements from './Achievements';
const entries = [
  { id: 'commits-1', name: 'Primeiro commit', category: 'commits', xp: 300, unlocked: true, awarded: true, current: 1, target: 1, progress: 100, description: 'Faça seu primeiro commit.' },
  { id: 'commits-100', name: 'Cem passos à frente', category: 'commits', xp: 1000, unlocked: false, awarded: false, current: 90, target: 100, progress: 90, description: 'Faça 100 commits.' }
];
beforeEach(() => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ achievements: entries, bonusXP: 300 }) }));
});
afterEach(() => { cleanup(); jest.useRealTimers(); delete global.fetch; delete window.matchMedia; });
test('carousel shows one-time XP, earned status, next requirements and automatic movement with pause', async () => {
  await act(async () => { render(<Achievements connected carousel />); });
  expect(screen.getByText('+1.000 XP')).toBeInTheDocument();
  expect(screen.getByText('BÔNUS RECEBIDO')).toBeInTheDocument();
  expect(screen.getByText('Faltam 10 para conquistar.')).toBeInTheDocument();
  const track = screen.getByLabelText('Conquistas; use as setas ou deslize para navegar');
  Object.defineProperties(track, { clientWidth: { value: 320 }, scrollWidth: { value: 960 } });
  track.scrollTo = jest.fn(({ left }) => { track.scrollLeft = left; });
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(track.scrollTo).toHaveBeenCalledWith({ left: 334, behavior: 'smooth' });
  fireEvent.mouseEnter(screen.getByRole('region', { name: 'Carrossel de conquistas' }));
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(track.scrollTo).toHaveBeenCalledTimes(1);
  fireEvent.mouseLeave(screen.getByRole('region', { name: 'Carrossel de conquistas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pausar carrossel de conquistas' }));
  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(track.scrollTo).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Próximas conquistas' }));
  expect(track.scrollTo).toHaveBeenCalledWith({ left: 640, behavior: 'smooth' });
});
test('reduced motion disables autoplay while manual navigation stays available', async () => {
  window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  await act(async () => { render(<Achievements connected carousel />); });
  const track = screen.getByLabelText('Conquistas; use as setas ou deslize para navegar');
  track.scrollTo = jest.fn();
  expect(screen.getByRole('button', { name: 'Iniciar carrossel de conquistas' })).toBeDisabled();
  await act(async () => { jest.advanceTimersByTime(12000); });
  expect(track.scrollTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Próximas conquistas' }));
  expect(track.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
});
test('profile collection filters milestones without turning them into repeatable claims', async () => {
  await act(async () => { render(<Achievements connected />); });
  fireEvent.click(screen.getByRole('button', { name: 'Desbloqueadas' }));
  expect(screen.getByText('Primeiro commit')).toBeInTheDocument();
  expect(screen.queryByText('Cem passos à frente')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'A conquistar' }));
  expect(screen.queryByText('Primeiro commit')).not.toBeInTheDocument();
  expect(screen.getByText('Cem passos à frente')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Receber' })).not.toBeInTheDocument();
});
