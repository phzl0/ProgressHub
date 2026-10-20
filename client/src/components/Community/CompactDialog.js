import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
const dialogStack=[];
export default function CompactDialog({ title, onClose, children, closeLabel='Fechar comentários', size }) {
  const panel = useRef(null); const close = useRef(onClose); close.current = onClose; const label = useId();
  useEffect(() => {
    dialogStack.push(label);
    const previous = document.activeElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const background = [...document.querySelectorAll('.ql-site-shell, .ph-chat-dock, .ph-chat-launcher, .ph-modal-backdrop')].filter(node=>!node.contains(panel.current)).map(node => ({ node, inert: node.getAttribute('inert'), hidden: node.getAttribute('aria-hidden') }));
    background.forEach(({node}) => { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); });
    panel.current?.querySelector('button')?.focus();
    const keydown = e => {
      if(dialogStack.at(-1)!==label)return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab') return;
      const focusable = [...panel.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { const index=dialogStack.indexOf(label);if(index>=0)dialogStack.splice(index,1); document.body.style.overflow = overflow; background.forEach(({node,inert,hidden}) => { if (inert === null) node.removeAttribute('inert'); else node.setAttribute('inert',inert); if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden',hidden); }); document.removeEventListener('keydown',keydown); previous?.focus(); };
  }, [label]);
  return createPortal(<div className="ph-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`ph-compact-dialog${size === 'large' ? ' ph-inventory-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby={label} ref={panel}><header><h2 id={label}>{title}</h2><button aria-label={closeLabel} onClick={onClose}><X size={18} /></button></header>{children}</section></div>,document.body);
}
