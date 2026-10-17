import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readApiResponse } from './apiResponse';
import { normalizeRepositoryURL } from './repositoryURL';
import ProfileEditor from './ProfileEditor';
afterEach(() => { delete global.fetch; });
test('429 plain-text responses produce a friendly error without attempting JSON parsing', async () => {
  const response = { ok: false, status: 429, headers: { get: () => '45' }, json: jest.fn(() => { throw new SyntaxError('Unexpected token T'); }) };
  await expect(readApiResponse(response)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('45 segundos') });
  expect(response.json).not.toHaveBeenCalled();
});
test('non-JSON server failures never leak the parser error to the interface', async () => {
  await expect(readApiResponse({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } })).rejects.toThrow('O servidor não respondeu como esperado');
});
test('repository validation rejects social and GitHub profile URLs while normalizing clone links', () => {
  expect(normalizeRepositoryURL('github.com/phzl0/QuestLog.git')).toBe('https://github.com/phzl0/QuestLog');
  for (const url of ['https://instagram.com/user', 'https://github.com/user', 'https://github.com/user/repo/blob/main/README.md']) expect(() => normalizeRepositoryURL(url)).toThrow('Use https://github.com/usuario/repositorio');
});
test('invalid showcase URLs retain the form and display guidance beside the field', async () => {
  global.fetch = jest.fn();
  render(<ProfileEditor onSaved={() => {}} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText('Nome do projeto 1'), { target: { value: 'Meu projeto' } });
  const field = screen.getByLabelText('Endereço do projeto 1');
  fireEvent.change(field, { target: { value: 'https://instagram.com/user' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar perfil' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Confira os endereços destacados');
  expect(field).toHaveValue('https://instagram.com/user');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(global.fetch).not.toHaveBeenCalled();
});
