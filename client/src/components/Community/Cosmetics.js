import React, { useState } from 'react';
import { Palette, Check, Save, RotateCcw } from 'lucide-react';
import useCommunityData, { COMMUNITY_API } from './useCommunityData';
import { readApiResponse } from './apiResponse';
import { CosmeticAvatar, CosmeticTitle, coverProps, DEFAULT_APPEARANCE } from './Appearance';
export default function Cosmetics({ me, onEquipped }) {
  const { data, error } = useCommunityData('/cosmetics', me?.connected);
  const [choice, setChoice] = useState(me?.appearance || DEFAULT_APPEARANCE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState('frames');
  const equipped = me?.appearance || DEFAULT_APPEARANCE;
  const changed = ['frame', 'cover', 'title'].some(key => choice[key] !== equipped[key]);
  const cover = coverProps(choice, me?.profile?.banner);
  const field = { frames: 'frame', covers: 'cover', titles: 'title' }[tab];
  async function equip() {
    setBusy(true); setMessage(''); setSaveError('');
    try {
      const response = await fetch(`${COMMUNITY_API}/cosmetics`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice) });
      const result = await readApiResponse(response);
      onEquipped(result.appearance); setMessage('Aparência equipada. Sua identidade está pronta para aparecer na comunidade.');
    } catch (err) { setSaveError(err.message); }
    finally { setBusy(false); }
  }
  function select(id) { setChoice(current => ({ ...current, [field]: id })); setMessage(''); setSaveError(''); }
  return <section className="ql-panel ql-cosmetics"><div className="ql-panel-head"><div><p className="ql-eyebrow">SUA ASSINATURA NA COMUNIDADE</p><h2><Palette size={20} /> Personalizar aparência</h2></div><span className="ql-tag ql-green-tag">COLEÇÃO INICIAL</span></div><p className="ql-caption">Experimente cinco molduras, três capas e títulos. A coleção está liberada nesta fase para escolhermos a identidade visual; regras de desbloqueio serão definidas depois. Cosméticos não alteram XP ou posição.</p>
    <div className="ql-cosmetics-layout"><div className="ql-cosmetic-preview"><div className={`ql-cosmetic-preview-cover ${cover.className}`} style={cover.style}><span className="ql-preview-label">PRÉVIA</span></div><div className="ql-cosmetic-preview-body"><CosmeticAvatar src={me?.picture} alt="Prévia da sua moldura" frame={choice.frame} size={90} /><strong>{me?.name || me?.login}</strong><span className="ql-caption">@{me?.login}</span><CosmeticTitle title={choice.title} /><span className="ql-caption">{me?.career?.title || 'Explorador'} · Nível {me?.career?.level || 1}</span></div><p className="ql-caption">A prévia não altera o perfil até você equipar.</p></div>
      <div className="ql-cosmetic-options"><div className="ql-cosmetic-tabs" role="group" aria-label="Categoria de cosméticos">{[['frames', 'Molduras'], ['covers', 'Capas'], ['titles', 'Títulos']].map(([id, name]) => <button type="button" key={id} disabled={busy} aria-pressed={tab === id} onClick={() => setTab(id)}>{name}</button>)}</div>{!data && !error && <p className="ql-caption" role="status">Carregando coleção…</p>}<div className="ql-cosmetic-items">{data?.catalog?.[tab]?.map(item => <button type="button" key={item.id} className="ql-cosmetic-item" aria-label={item.name} aria-pressed={choice[field] === item.id} disabled={busy} onClick={() => select(item.id)}>
        {tab === 'frames' ? <CosmeticAvatar src={me?.picture} frame={item.id} size={56} /> : tab === 'covers' ? <span className={`ql-cosmetic-cover-swatch ql-cover-${item.id}`} style={item.id === 'custom' ? coverProps({ cover: 'custom' }, me?.profile?.banner).style : undefined} /> : <span className="ql-cosmetic-title-swatch">Aa</span>}
        <span><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</span>{choice[field] === item.id && <Check size={16} className="ql-green" />}
      </button>)}</div></div></div>
    {(error || saveError) && <p role="alert" className="ql-error">{saveError || error}</p>}{message && <p role="status" className="ql-profile-saved">{message}</p>}
    <div className="ql-cosmetic-footer"><button className="ql-refresh" disabled={busy || !changed} onClick={() => { setChoice(equipped); setMessage(''); }}><RotateCcw size={15} />Desfazer prévia</button><button className="ql-button" disabled={busy || !changed || !data} onClick={equip}><Save size={16} />{busy ? 'Equipando…' : changed ? 'Equipar aparência' : 'Aparência equipada'}</button></div><p className="ql-caption">Escolha “Meu banner” para voltar à imagem enviada em Editar perfil. Sua foto continua vinculada ao GitHub.</p>
  </section>;
}
