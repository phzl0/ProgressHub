import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import CompactDialog from './CompactDialog';
import { Author, socialRequest, requestId } from './socialAPI';
export default function CommentsDialog({ post, onClose, onChanged }) {
  const [rows,setRows] = useState([]); const [more,setMore] = useState(false); const [loaded,setLoaded] = useState(false); const [draft,setDraft] = useState(''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const pending = useRef(null); const lock = useRef(false);
  useEffect(() => { let alive = true; socialRequest(`feed/comments?postId=${post.id}`).then(d => { if (alive) { setRows(d.comments); setMore(d.hasMore); setLoaded(true); } }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [post.id]);
  async function loadOlder() {
    if(lock.current) return; lock.current=true; setBusy(true); setError('');
    try { const d=await socialRequest(`feed/comments?postId=${post.id}&before=${encodeURIComponent(rows.at(-1).id)}`); setRows(old => [...old,...d.comments]); setMore(d.hasMore); } catch(e) { setError(e.message); } finally {lock.current=false;setBusy(false);}
  }
  async function send(e) {
    e.preventDefault(); if(lock.current || !draft.trim()) return; lock.current=true;setBusy(true);setError('');
    if(pending.current?.text !== draft) pending.current={action:'comment',postId:post.id,text:draft,requestId:requestId()};
    try { await socialRequest('feed',pending.current); setDraft('');pending.current=null; const d=await socialRequest(`feed/comments?postId=${post.id}`);setRows(d.comments);setMore(d.hasMore);setLoaded(true);onChanged(); } catch(err) {setError(err.message);} finally {lock.current=false;setBusy(false);}
  }
  async function remove(id) {
    if(lock.current) return;lock.current=true;setBusy(true);setError('');
    try {await socialRequest('feed',{action:'delete-comment',postId:post.id,id});setRows(old=>old.filter(r=>r.id!==id));onChanged();} catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
  }
  return <CompactDialog title="Comentários" onClose={onClose}><div className="ph-comment-context"><Author author={post.author}/><p>{post.text || 'Publicação com foto'}</p></div><div className="ph-comment-scroll">{!loaded && !error && <p role="status">Carregando comentários…</p>}{loaded && !rows.length && <p className="ph-social-note">Comece a conversa. Uma dica pode fazer a diferença.</p>}{rows.map(c=><div className="ph-comment" key={c.id}><Author author={c.author}/><p>{c.text}</p>{c.own&&<button aria-label="Excluir meu comentário" disabled={busy} onClick={()=>remove(c.id)}><Trash2 size={13}/></button>}</div>)}{more&&<button disabled={busy} onClick={loadOlder}>Ver comentários anteriores</button>}</div>{error&&<p role="alert">{error}</p>}<form className="ph-comment-compose" onSubmit={send}><input aria-label="Escrever comentário" placeholder="Contribua com a conversa…" maxLength={600} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="ql-button" disabled={busy||!draft.trim()}>Comentar</button></form></CompactDialog>;
}
