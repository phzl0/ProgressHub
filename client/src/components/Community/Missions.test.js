import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Missions from './Missions';
const mission = (number, completed, awarded = false) => ({ id: `daily-${number}`, number, kind: 'daily', periodKey: '2026-10-17', endsAt: '2026-10-18T00:00:00Z', xp: 300, description: `Objetivo ${number}`, requirements: [{ label: 'commit', current: completed ? 1 : 0, target: 1 }], progress: completed ? 100 : 0, completedAt: completed ? '2026-10-17T12:00:00Z' : null, awarded, encouragement: completed ? 'Concluída' : 'Falta um commit' });
afterEach(() => { delete global.fetch; });
test('incomplete rewards are disabled, complete rewards require a click, received rewards stay disabled', async () => {
  let claimed = false;
  const onClaimed = jest.fn();
  global.fetch = jest.fn(async (url) => {
    if (url.endsWith('/claim')) claimed = true;
    return { ok: true, json: async () => ({ missions: [mission(1, false), mission(2, true, claimed), mission(3, true, true)] }) };
  });
  render(<Missions connected onClaimed={onClaimed} />);
  expect(await screen.findByRole('button', { name: 'Receber bônus da missão 1' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Recebido bônus da missão 3' })).toBeDisabled();
  const receive = screen.getByRole('button', { name: 'Receber bônus da missão 2' });
  expect(receive).toBeEnabled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(receive);
  expect(await screen.findByRole('button', { name: 'Recebido bônus da missão 2' })).toBeDisabled();
  await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));
  const post = global.fetch.mock.calls.find(([url]) => url.endsWith('/claim'));
  expect(JSON.parse(post[1].body)).toEqual({ missionId: 'daily-2', periodKey: '2026-10-17' });
  expect(screen.getAllByRole('progressbar')[1]).toHaveAttribute('aria-valuenow', '100');
});
test('failed claims keep the objective available and show the server message', async () => {
  global.fetch = jest.fn(async (url) => url.endsWith('/claim')
    ? { ok: false, json: async () => ({ error: 'Sincronização em andamento.' }) }
    : { ok: true, json: async () => ({ missions: [mission(2, true)] }) });
  render(<Missions connected />);
  fireEvent.click(await screen.findByRole('button', { name: 'Receber bônus da missão 2' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sincronização em andamento.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Receber bônus da missão 2' })).toBeEnabled());
});
