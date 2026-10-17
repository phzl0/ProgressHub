import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Cosmetics from './Cosmetics';
import { CosmeticAvatar, CosmeticTitle } from './Appearance';
const appearance = { frame: 'essential', cover: 'custom', title: 'none' };
const catalog = {
  frames: [{ id: 'essential', name: 'Essencial' }, { id: 'circuit', name: 'Circuito' }, { id: 'terminal', name: 'Terminal' }, { id: 'crystal', name: 'Cristal' }, { id: 'prestige', name: 'Prestígio' }],
  covers: [{ id: 'custom', name: 'Meu banner' }, { id: 'aurora', name: 'Aurora' }, { id: 'matrix', name: 'Malha digital' }, { id: 'orbit', name: 'Órbita' }],
  titles: [{ id: 'none', name: 'Sem título cosmético' }, { id: 'building', name: 'Ideias em código' }]
};
afterEach(() => { delete global.fetch; });
test('cosmetic preview changes before saving and equips only the selected allowlisted appearance', async () => {
  const onEquipped = jest.fn();
  global.fetch = jest.fn(async (_, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { appearance: JSON.parse(options.body) } : { catalog, appearance } }));
  render(<Cosmetics me={{ connected: true, login: 'dev', appearance }} onEquipped={onEquipped} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cristal' }));
  expect(onEquipped).not.toHaveBeenCalled();
  expect(global.fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Capas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Órbita' }));
  fireEvent.click(screen.getByRole('button', { name: 'Títulos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ideias em código' }));
  fireEvent.click(screen.getByRole('button', { name: 'Equipar aparência' }));
  await waitFor(() => expect(onEquipped).toHaveBeenCalledWith({ frame: 'crystal', cover: 'orbit', title: 'building' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Aparência equipada');
});
test('avatars preserve the GitHub image and cosmetic titles do not replace earned career titles', () => {
  const { container } = render(<><CosmeticAvatar src="https://avatars.githubusercontent.com/u/42" frame="terminal" alt="Meu avatar" /><CosmeticTitle title="building" /><span>Explorador · Nível 2</span></>);
  expect(screen.getByRole('img', { name: 'Meu avatar' })).toHaveAttribute('src', 'https://avatars.githubusercontent.com/u/42');
  expect(container.querySelector('.ql-frame-terminal svg')).toBeInTheDocument();
  expect(screen.getByText('Ideias em código')).toBeInTheDocument(); expect(screen.getByText('Explorador · Nível 2')).toBeInTheDocument();
});
