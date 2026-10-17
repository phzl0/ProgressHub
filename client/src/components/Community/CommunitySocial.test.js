import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommunitySocial from './CommunitySocial';
import { viewFromHash } from './navigation';
const me = { connected: true, login: 'alice' };
const post = { id: '123456789012345678901234', text: '<script>plain</script>', kind: 'help', createdAt: '2026-10-17T00:00:00Z', author: { login: 'bob', profileId: '42' }, comments: [], likes: 0, commentCount: 0 };
beforeEach(() => { window.location.hash = 'community'; global.fetch = jest.fn(async (_url, options) => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => options?.method === 'POST' ? { ok: true } : { posts: [post], hasMore: false } })); });
afterEach(() => jest.restoreAllMocks());
test('community routes preserve feed, individual posts and distinct chats', () => {
  for (const hash of ['#community/general', '#community/help', '#community/groups', `#community/post/${post.id}`]) expect(viewFromHash(hash)).toBe('community');
});
test('feed renders plain text, likes idempotently and submits a comment', async () => {
  await act(async () => render(<CommunitySocial me={me} />));
  expect(await screen.findByText('<script>plain</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Curtir/ }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/feed'), expect.objectContaining({ body: JSON.stringify({ action: 'like', postId: post.id, liked: true }) })));
  await waitFor(() => expect(screen.getByRole('button', { name: /Comentários/ })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: /Comentários/ }));
  fireEvent.change(screen.getByLabelText('Escrever comentário'), { target: { value: 'Posso ajudar!' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Comentar' })));
  expect(global.fetch.mock.calls.some(([, options]) => options?.body && JSON.parse(options.body).action === 'comment' && JSON.parse(options.body).text === 'Posso ajudar!')).toBe(true);
});
test('guest sees entry point without fetching social content', () => {
  render(<CommunitySocial me={{ connected: false }} />);
  expect(screen.getByRole('link', { name: 'Entrar com GitHub' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
