import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Hash, Send, Trash2, ChevronUp, ArrowDown, MessagesSquare, RefreshCw } from 'lucide-react';
import { COMMUNITY_API } from './useCommunityData';
import { readApiResponse } from './apiResponse';
import { CosmeticAvatar, CosmeticTitle } from './Appearance';
const LIMIT = 180;
const merge = (old, incoming) => [...new Map([...old, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => a.id.localeCompare(b.id)).slice(-LIMIT);
const requestId = () => window.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export default function CommunityChat({ connected, channel = 'general', title = 'Chat geral' }) {
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef([]);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000); return () => window.clearTimeout(timer); }, [cooldown]);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [unread, setUnread] = useState(false);
  const viewport = useRef(null);
  const nearBottom = useRef(true);
  const epoch = useRef(0);
  const alive = useRef(false);
  const polling = useRef(false);
  const backoff = useRef(0);
  const pending = useRef(null);
  const sendLock = useRef(false);
  const historyLock = useRef(false);
  const scrollBottom = () => { const node = viewport.current; if (node) node.scrollTop = node.scrollHeight; setUnread(false); nearBottom.current = true; };
  const updateMessages = useCallback(value => { messagesRef.current = value; setMessages(value); }, []);
  const refresh = useCallback(async (signal) => {
    if (polling.current || document.visibilityState === 'hidden' || Date.now() < backoff.current) return;
    polling.current = true;
    const version = epoch.current;
    try {
      const known = messagesRef.current.map(message => message.id).join(',');
      const value = await readApiResponse(await fetch(`${COMMUNITY_API}/chat?channel=${encodeURIComponent(channel)}${known ? `&known=${known}` : ''}`, { credentials: 'include', signal }));
      if (!alive.current || signal?.aborted || version !== epoch.current) return;
      const previous = messagesRef.current;
      const combined = merge(previous, value.messages || []);
      if (previous.length && (value.messages || []).some(message => !previous.some(old => old.id === message.id)) && !nearBottom.current) setUnread(true);
      updateMessages(combined);
      if (!previous.length) setHasOlder(Boolean(value.hasOlder));
      setLoaded(true); setOnline(true); setError('');
    } catch (err) {
      if (alive.current && !signal?.aborted && err.name !== 'AbortError') { setOnline(false); setError(err.message); if (err.status === 429) backoff.current = Date.now() + 60000; }
    } finally { polling.current = false; }
  }, [updateMessages, channel]);
  useEffect(() => {
    if (!connected) return;
    alive.current = true;
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = window.setInterval(() => refresh(controller.signal), 5000);
    const resume = () => { if (document.visibilityState === 'visible') refresh(controller.signal); };
    document.addEventListener('visibilitychange', resume);
    return () => { alive.current = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [connected, refresh]);
  useEffect(() => { if (nearBottom.current) scrollBottom(); }, [messages]);
  async function older() {
    if (!messages.length || historyLock.current) return;
    historyLock.current = true;
    setHistoryBusy(true); setError('');
    const version = epoch.current;
    const node = viewport.current; const height = node?.scrollHeight || 0; const top = node?.scrollTop || 0;
    try {
      const value = await readApiResponse(await fetch(`${COMMUNITY_API}/chat?channel=${encodeURIComponent(channel)}&before=${messages[0].id}`, { credentials: 'include' }));
      if (!alive.current || version !== epoch.current) return;
      nearBottom.current = false;
      // Stop history loading at the bounded view size; recent messages are always refreshed.
      updateMessages(merge(value.messages || [], messagesRef.current)); setHasOlder(Boolean(value.hasOlder));
      window.requestAnimationFrame(() => { if (alive.current && node) node.scrollTop = top + node.scrollHeight - height; });
    } catch (err) { if (alive.current) setError(err.message); }
    finally { historyLock.current = false; if (alive.current) setHistoryBusy(false); }
  }
  async function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (sendLock.current || cooldown || !text || [...text].length > 600) return;
    sendLock.current = true; setSending(true); setError(''); epoch.current += 1;
    if (!pending.current || pending.current.text !== text) pending.current = { text, requestId: requestId() };
    try {
      const value = await readApiResponse(await fetch(`${COMMUNITY_API}/chat`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pending.current, channel }) }));
      if (!alive.current) return;
      epoch.current += 1; nearBottom.current = true;
      updateMessages(merge(messagesRef.current, [value.message])); setDraft(''); pending.current = null; setOnline(true); setLoaded(true);
      setCooldown(5);
    } catch (err) { if (alive.current) setError(err.message); }
    finally { sendLock.current = false; if (alive.current) setSending(false); }
  }
  async function remove(id) {
    if (deleting) return;
    setDeleting(id); setError(''); epoch.current += 1;
    try {
      await readApiResponse(await fetch(`${COMMUNITY_API}/chat/delete`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }));
      if (alive.current) { epoch.current += 1; updateMessages(messagesRef.current.map(message => message.id === id ? { ...message, text: '', deleted: true } : message)); setConfirmDelete(null); }
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setDeleting(null); }
  }
  if (!connected) return <section className="ql-chat-welcome"><MessagesSquare size={30} /><h2>Converse com quem também está construindo.</h2><p>Entre com GitHub para acessar o chat geral da comunidade.</p><a href={`${COMMUNITY_API}/auth`} className="ql-button">Entrar com GitHub</a></section>;
  return <section className="ql-chat" aria-label="Chat coletivo"><header className="ql-chat-heading"><div><span className="ql-chat-channel-icon"><Hash size={20} /></span><div><h2>{title}</h2><p>Ideias, projetos e aprendizados em boa companhia.</p></div></div><span className={`ql-chat-status${online ? ' is-current' : ''}`}>{online ? 'Atualização automática' : 'Conectando…'}</span></header>
    <div className="ql-chat-guideline">Compartilhe seu progresso, peça uma dica ou apresente um projeto. Respeito vem primeiro.</div>
    <div ref={viewport} className="ql-chat-stream" tabIndex={0} aria-label="Histórico do chat geral" onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70; if (nearBottom.current) setUnread(false); if (node.scrollTop < 35 && hasOlder && loaded && !historyBusy && messages.length < LIMIT) older(); }}>
      {hasOlder && messages.length < LIMIT && <button className="ql-chat-history" disabled={historyBusy} onClick={older}><ChevronUp size={13} />{historyBusy ? 'Carregando…' : 'Carregar anteriores'}</button>}
      {messages.length >= LIMIT && <p className="ql-chat-history-note">Exibindo as 180 mensagens mais recentes carregadas.</p>}
      {!loaded && !error && <p role="status" className="ql-chat-empty">Carregando a conversa…</p>}{loaded && !messages.length && <div className="ql-chat-empty"><MessagesSquare size={26} /><h3>A conversa começa com um olá.</h3><p>O que você está construindo hoje?</p></div>}
      <ol className="ql-chat-messages">{messages.map(message => <li key={message.id} className={`ql-chat-message${message.own ? ' is-own' : ''}`}><CosmeticAvatar src={message.author.picture} frame={message.author.appearance?.frame} size={32} /><div className="ql-chat-message-body"><div className="ql-chat-message-meta">{message.author.profileId ? <a href={`#profile/${message.author.profileId}`}>@{message.author.login}</a> : <strong>@{message.author.login}</strong>}<CosmeticTitle title={message.author.appearance?.title} /><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('pt-BR')}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>{message.own && !message.deleted && <button className="ql-chat-delete" onClick={() => setConfirmDelete(confirmDelete === message.id ? null : message.id)} aria-label="Apagar minha mensagem"><Trash2 size={13} /></button>}</div><p className={message.deleted ? 'ql-chat-deleted' : ''}>{message.deleted ? 'Mensagem apagada' : message.text}</p>{confirmDelete === message.id && !message.deleted && <div className="ql-chat-delete-confirm"><span>Apagar esta mensagem?</span><button disabled={Boolean(deleting)} onClick={() => remove(message.id)}>Apagar</button><button onClick={() => setConfirmDelete(null)}>Cancelar</button></div>}</div></li>)}</ol>
    </div>
    {unread && <button className="ql-chat-new" onClick={scrollBottom}>Novas mensagens <ArrowDown size={13} /></button>}
    {cooldown > 0 && <p className="ph-chat-countdown" role="status">Você pode enviar outra mensagem em {cooldown}s.</p>}
    {error && <div className="ql-chat-error" role="alert"><span>{error}</span><button aria-label="Tentar atualizar o chat" onClick={() => refresh()}><RefreshCw size={14} /></button></div>}
    <form className="ql-chat-composer" onSubmit={send}><label className="ql-sr-only" htmlFor="chat-message">Sua mensagem</label><textarea id="chat-message" rows={2} maxLength={1200} disabled={sending} value={draft} placeholder="Conte o que você está construindo…" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /><div className="ql-chat-composer-bottom"><span>Nome e avatar ficam visíveis no chat · sem XP</span><span>{[...draft].length}/600</span><button className="ql-button" disabled={sending || cooldown || !draft.trim() || [...draft.trim()].length > 600} type="submit"><Send size={14} />{sending ? 'Enviando…' : cooldown ? 'Aguarde…' : 'Enviar'}</button></div></form>
  </section>;
}
