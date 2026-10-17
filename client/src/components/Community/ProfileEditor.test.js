import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileEditor, { prepareBanner } from './ProfileEditor';
import MyProfile from './MyProfile';
afterEach(() => { delete global.fetch; });
test('profile editor saves description and two labeled links with normalized addresses', async () => {
  const saved = jest.fn();
  global.fetch = jest.fn(async (_, options) => ({ ok: true, json: async () => ({ profile: JSON.parse(options.body) }) }));
  render(<ProfileEditor onSaved={saved} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Construindo ferramentas open source.' } });
  fireEvent.change(screen.getByLabelText('Nome do link 1'), { target: { value: 'Instagram' } });
  fireEvent.change(screen.getByLabelText('Endereço do link 1'), { target: { value: 'instagram.com/developer' } });
  fireEvent.change(screen.getByLabelText('Nome do link 2'), { target: { value: 'Portfólio' } });
  fireEvent.change(screen.getByLabelText('Endereço do link 2'), { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
  await screen.findByRole('button', { name: 'Salvar perfil' });
  expect(saved).toHaveBeenCalledWith({ bio: 'Construindo ferramentas open source.', banner: '', links: [{ label: 'Instagram', url: 'https://instagram.com/developer' }, { label: 'Portfólio', url: 'https://example.com' }] });
});
test('incomplete links do not save and a banner can be removed before saving', async () => {
  global.fetch = jest.fn();
  render(<ProfileEditor profile={{ banner: 'data:image/webp;base64,example' }} onSaved={() => {}} onCancel={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));
  expect(screen.queryByRole('button', { name: 'Remover imagem' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome do link 1'), { target: { value: 'Meu site' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Preencha o nome');
  expect(global.fetch).not.toHaveBeenCalled();
});
test('image preparation rejects unsupported formats and oversized files', async () => {
  await expect(prepareBanner(new File(['svg'], 'banner.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPG, PNG ou WebP');
  await expect(prepareBanner({ type: 'image/png', size: 9 * 1024 * 1024 })).rejects.toThrow('8 MB');
});
test('personal profile shows saved biography, links and opens its editor', () => {
  render(<MyProfile me={{ connected: true, login: 'dev', profile: { bio: 'Minha história', links: [{ label: 'Meu site', url: 'https://example.com' }] } }} />);
  expect(screen.getByText('Minha história')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Meu site' })).toHaveAttribute('href', 'https://example.com');
  fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));
  expect(screen.getByRole('form', { name: 'Editar meu perfil' })).toBeInTheDocument();
});
