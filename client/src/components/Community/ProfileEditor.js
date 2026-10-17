import { normalizeRepositoryURL, REPOSITORY_HELP } from './repositoryURL';
import { readApiResponse } from './apiResponse';
import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, X } from 'lucide-react';
import { PROJECT_ICONS, ProjectIcon } from './ProjectShowcase';
const API = `${process.env.REACT_APP_PROD || 'http://localhost:3001/api'}/community`;
export async function prepareBanner(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Escolha uma imagem de até 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Não foi possível abrir essa imagem.')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 500;
    const ratio = Math.max(canvas.width / image.width, canvas.height / image.height);
    canvas.getContext('2d').drawImage(image, (canvas.width - image.width * ratio) / 2, (canvas.height - image.height * ratio) / 2, image.width * ratio, image.height * ratio);
    let banner;
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      banner = canvas.toDataURL('image/webp', quality);
      if (banner.startsWith('data:image/webp;') && banner.length <= 409622) return banner;
    }
    throw new Error('Essa imagem ficou muito grande. Tente uma imagem mais simples.');
  } finally { URL.revokeObjectURL(url); }
}
export default function ProfileEditor({ profile = {}, onSaved, onCancel }) {
  const formRef = useRef(null);
  useEffect(() => { formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, []);
  const [bio, setBio] = useState(profile.bio || '');
  const [banner, setBanner] = useState(profile.banner || '');
  const [links, setLinks] = useState([0, 1].map(i => profile.links?.[i] || { label: '', url: '' }));
  const [projects, setProjects] = useState([0, 1, 2].map(i => profile.projects?.[i] || { name: '', description: '', url: '', icon: 'star' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectErrors, setProjectErrors] = useState({});
  function changeLink(index, key, value) { setLinks(current => current.map((link, i) => i === index ? { ...link, [key]: value } : link)); }
  function checkProjectURL(index, value) {
    let message = '';
    if (value.trim()) { try { normalizeRepositoryURL(value); } catch (err) { message = err.message; } }
    setProjectErrors(current => ({ ...current, [index]: message }));
    return message;
  }
  function changeProject(index, key, value) { setProjects(current => current.map((project, i) => i === index ? { ...project, [key]: value } : project)); }
  async function chooseBanner(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError('');
    try { setBanner(await prepareBanner(file)); } catch (err) { setError(err.message); }
    finally { setBusy(false); event.target.value = ''; }
  }
  async function save(event) {
    event.preventDefault(); setError('');
    const filled = links.filter(link => link.label.trim() || link.url.trim());
    if (filled.some(link => !link.label.trim() || !link.url.trim())) { setError('Preencha o nome e o endereço de cada link, ou deixe os dois vazios.'); return; }
    const featured = projects.filter(project => project.name.trim() || project.description.trim() || project.url.trim());
    if (featured.some(project => !project.name.trim() || !project.url.trim())) { setError('Preencha nome e endereço de cada projeto, ou deixe os campos vazios.'); return; }
    const errors = {};
    projects.forEach((project, index) => { if (project.url.trim()) { try { normalizeRepositoryURL(project.url); } catch (err) { errors[index] = err.message; } } });
    setProjectErrors(errors);
    if (Object.keys(errors).length) { setError('Confira os endereços destacados. Seus dados continuam preenchidos.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API}/profile`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio, banner, projects: featured.map(project => ({ ...project, url: normalizeRepositoryURL(project.url) })), links: filled.map(link => ({ label: link.label.trim(), url: /^https?:\/\//i.test(link.url.trim()) ? link.url.trim() : `https://${link.url.trim()}` })) }) });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o perfil.');
      if (data.appearance) onSaved(data.profile, data.appearance); else onSaved(data.profile);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <form noValidate ref={formRef} className="ql-panel ql-profile-editor" onSubmit={save} aria-label="Editar meu perfil"><div className="ql-panel-head"><div><p className="ql-eyebrow">DEIXE SUA MARCA</p><h2>Personalizar perfil</h2></div><button type="button" className="ql-refresh" onClick={onCancel} disabled={busy} aria-label="Cancelar edição"><X size={18} /></button></div>
    <div className="ql-banner-preview" style={banner ? { backgroundImage: `linear-gradient(0deg,rgba(0,0,0,.3),transparent),url("${banner}")` } : undefined}><ImagePlus size={28} /><span>Seu espaço. Sua identidade.</span></div>
    <div className="ql-editor-banner-actions"><label className="ql-button ql-button-secondary">{busy ? 'Processando…' : 'Escolher imagem'}<input aria-label="Imagem do banner" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={chooseBanner} /></label>{banner && <button type="button" className="ql-refresh" disabled={busy} onClick={() => setBanner('')}>Remover imagem</button>}<p className="ql-caption">JPG, PNG ou WebP, até 8 MB. Recorte central automático no formato 1600 × 500.</p></div>
    <label className="ql-field">Descrição<textarea aria-label="Descrição do perfil" maxLength={300} rows={4} value={bio} onChange={event => setBio(event.target.value)} placeholder="O que você constrói? Conte um pouco sobre você." disabled={busy} /><span className="ql-caption">{bio.length}/300 caracteres</span></label>
    <div className="ql-editor-links">{links.map((link, index) => <fieldset key={index}><legend>Link {index + 1} · opcional</legend><label className="ql-field">Nome do link {index + 1}<input maxLength={30} value={link.label} onChange={event => changeLink(index, 'label', event.target.value)} placeholder="Instagram, portfólio…" disabled={busy} /></label><label className="ql-field">Endereço do link {index + 1}<input maxLength={500} value={link.url} onChange={event => changeLink(index, 'url', event.target.value)} placeholder="https://…" disabled={busy} /></label></fieldset>)}</div>
    <div className="ql-editor-projects"><div><h3>Projetos em destaque</h3><p className="ql-caption">Até três repositórios GitHub. Deixe todos os campos vazios para remover um projeto.</p></div>{projects.map((project, index) => <fieldset key={index}><legend>Projeto {index + 1} · opcional</legend><div className="ql-project-editor-top"><label className="ql-field">Ícone do projeto {index + 1}<select value={project.icon} disabled={busy} onChange={event => changeProject(index, 'icon', event.target.value)}>{Object.entries(PROJECT_ICONS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><span className="ql-project-icon"><ProjectIcon name={project.icon} /></span></div><label className="ql-field">Nome do projeto {index + 1}<input maxLength={60} value={project.name} disabled={busy} onChange={event => changeProject(index, 'name', event.target.value)} placeholder="O que você construiu?" /></label><label className="ql-field">Descrição do projeto {index + 1}<textarea rows={2} maxLength={180} value={project.description} disabled={busy} onChange={event => changeProject(index, 'description', event.target.value)} /></label><label className="ql-field">Endereço do projeto {index + 1}<input maxLength={500} value={project.url} aria-invalid={Boolean(projectErrors[index])} aria-describedby={`project-url-help-${index}`} onBlur={() => checkProjectURL(index, project.url)} disabled={busy} onChange={event => changeProject(index, 'url', event.target.value)} placeholder="https://github.com/usuario/repositorio" /></label><p id={`project-url-help-${index}`} className={projectErrors[index] ? 'ql-error ql-field-error' : 'ql-caption'}>{projectErrors[index] || REPOSITORY_HELP}</p></fieldset>)}</div>
    <p className="ql-caption">Banner, descrição, projetos e links aparecem para outras pessoas quando seu perfil estiver público.</p>{error && <p className="ql-error" role="alert">{error}</p>}<div className="ql-editor-footer"><button type="button" className="ql-button ql-button-secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button type="submit" className="ql-button" disabled={busy}><Save size={16} />{busy ? 'Aguarde…' : 'Salvar perfil'}</button></div>
  </form>;
}
