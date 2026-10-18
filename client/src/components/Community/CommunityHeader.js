import React, { useEffect, useRef, useState } from 'react';
import { Settings, UserRound, ShieldCheck, LogOut, X, Menu, BookOpen, RefreshCw } from 'lucide-react';
import { socialRequest } from './socialAPI';
import Inbox from './Inbox';
import HeaderSearch from './HeaderSearch';
import BrandMark from './BrandMark';
import { COMMUNITY_API } from './useCommunityData';
import { CosmeticAvatar } from './Appearance';
import { PRIMARY_NAVIGATION, parentView } from './navigation';
function AccountDrawer({ tab, navigate, onClose, me, logout, busy }) {
  const panel = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = [...document.querySelectorAll('.ql-site-header, .ql-site-body, .ql-site-footer')].map(node => ({ node, inert: node.getAttribute('inert'), hidden: node.getAttribute('aria-hidden') }));
    for (const { node } of background) { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); }
    panel.current?.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll('a[href], button:not(:disabled)')];
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      for (const { node, inert, hidden } of background) {
        if (inert === null) node.removeAttribute('inert'); else node.setAttribute('inert', inert);
        if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
      }
      document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  const links = [{ id: 'settings', label: 'Configurações', icon: Settings }, { id: 'account', label: 'Conta', icon: UserRound }, { id: 'privacy', label: 'Privacidade', icon: ShieldCheck }, { id: 'information', label: 'Regras e ajuda', icon: BookOpen }];
  if(me?.adminRole)links.push({id:'admin',label:'Administração',icon:ShieldCheck});
  return <div className="ql-account-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><aside ref={panel} className="ql-account-drawer" role="dialog" aria-modal="true" aria-labelledby="account-menu-heading" id="community-account-menu"><div className="ql-drawer-heading"><h2 id="account-menu-heading">Sua conta</h2><button className="ql-icon-button" onClick={onClose} aria-label="Fechar menu da conta"><X size={18} /></button></div><p className="ql-caption">{me?.connected ? `@${me.login} · GitHub conectado` : 'Entre com GitHub para participar.'}</p><nav aria-label="Opções da conta">{links.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={tab === id ? 'page' : undefined} onClick={event => { navigate(id, event); if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onClose(); }}><Icon size={18} />{label}</a>)}</nav>{me?.connected && <button className="ql-drawer-logout" disabled={busy} onClick={logout}><LogOut size={18} /> Sair da conta</button>}<p className="ql-caption ql-drawer-note">Progress Hub · Evolua construindo.</p></aside></div>;
}
function ProfileMenu({ me, navigate }) {
  const [open, setOpen] = useState(false); const [data, setData] = useState(null); const [error, setError] = useState('');
  const root = useRef(null);
  useEffect(() => { if (!open) return; let alive = true; socialRequest('social').then(d => { if (alive) { setData(d); setError(''); } }).catch(() => { if (alive) setError('Não foi possível carregar seus contatos.'); }); const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); }; document.addEventListener('pointerdown', outside); return () => { alive = false; document.removeEventListener('pointerdown', outside); }; }, [open]);
  if (!me?.connected) return <a className="ql-profile-shortcut" href={`${COMMUNITY_API}/auth`} aria-label="Entrar com GitHub"><UserRound size={20} /></a>;
  const contacts = data?.contacts?.filter(c => c.status === 'accepted') || [];
  return <div ref={root} className="ph-profile-menu" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } }}><button className="ql-profile-shortcut" aria-label="Perfil e contatos" aria-expanded={open} aria-controls="profile-social-menu" onClick={() => setOpen(v => !v)}><CosmeticAvatar src={me.picture} frame={me.appearance?.frame} size={36} /></button>{open && <div className="ph-profile-dropdown" id="profile-social-menu"><strong>@{me.login}</strong><small>GitHub conectado</small><a href="#me" onClick={e => { navigate('me', e); setOpen(false); }}>Meu perfil</a><div className="ph-dropdown-heading">Contatos · {contacts.length}</div>{error ? <p>{error}</p> : !data ? <p>Carregando…</p> : !contacts.length ? <p>Seus contatos aparecerão aqui.</p> : contacts.slice(0, 6).map(c => <a key={c.id} href={c.person?.profileId ? `#profile/${c.person.profileId}` : '#community/contacts'} onClick={() => setOpen(false)}><CosmeticAvatar src={c.person?.picture} frame={c.person?.appearance?.frame} size={25} />@{c.person?.login}</a>)}<a href="#community/contacts" onClick={() => setOpen(false)}>Contatos</a><a href="#community/invitations" onClick={() => setOpen(false)}>Convites{data?.contacts?.some(c => c.status === 'pending' && c.incoming) ? ' · novos' : ''}</a><a href="#community/groups" onClick={() => setOpen(false)}>Grupos</a><a href="#account" onClick={() => setOpen(false)}>Minha conta</a><a href="#settings" onClick={() => setOpen(false)}>Configurações</a></div>}</div>;
}
export default function CommunityHeader({ tab, navigate, me, sync, logout, busy, loading, syncWarning }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => { setAccountOpen(false); setNavigationOpen(false); }, [tab]);
  return <>
    <header className="ql-site-header"><div className="ql-header-inner"><a href="#home" onClick={event => navigate('home', event)} className="ql-brand" aria-label="Progress Hub · início"><span className="ql-brand-mark"><BrandMark /></span><span>PROGRESS<span className="ql-green"> HUB</span><small>EVOLUA CONSTRUINDO</small></span></a>
      <button className="ql-icon-button ql-mobile-nav-button" aria-label={navigationOpen ? 'Fechar navegação' : 'Abrir navegação'} aria-expanded={navigationOpen} aria-controls="community-primary-navigation" onClick={() => setNavigationOpen(open => !open)}>{navigationOpen ? <X size={19} /> : <Menu size={19} />}</button>
      <HeaderSearch connected={me?.connected} /><nav id="community-primary-navigation" className={`ql-horizontal-nav${navigationOpen ? ' is-open' : ''}`} aria-label="Navegação principal">{PRIMARY_NAVIGATION.map(({ id, path, label, icon: Icon }) => <a key={id} href={`#${path}`} aria-label={label} aria-current={parentView(tab) === id ? 'page' : undefined} onClick={event => { navigate(path, event); if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) setNavigationOpen(false); }}><Icon size={16} /><span>{label}</span></a>)}</nav>
      <div className="ql-header-actions">{me?.connected && <button className={`ql-icon-button ql-compact-sync${syncWarning ? ' has-sync-warning' : ''}`} disabled={busy || loading} onClick={sync} aria-label={syncWarning ? 'Atualizar contribuições: sincronização pendente' : 'Atualizar contribuições'} title={syncWarning ? 'Atualização do GitHub pendente. A pontuação salva foi preservada. Clique para tentar novamente.' : 'Atualizar contribuições'}><RefreshCw size={16} className={busy ? 'ql-spin' : ''} />{syncWarning && <span className="ql-sync-warning-dot" aria-hidden="true" />}</button>}<Inbox connected={me?.connected} /><button className="ql-icon-button" aria-label="Abrir menu da conta" title="Configurações e conta" aria-expanded={accountOpen} aria-controls="community-account-menu" onClick={() => setAccountOpen(open => !open)}><Settings size={18} /></button><ProfileMenu me={me} navigate={navigate} /></div>
    </div></header>
    {accountOpen && <AccountDrawer tab={tab} navigate={navigate} onClose={() => setAccountOpen(false)} me={me} logout={logout} busy={busy} />}
  </>;
}
