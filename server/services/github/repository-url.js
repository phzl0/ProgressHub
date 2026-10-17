function repositoryURL(value, optional = false) {
  const fail = () => { const error = new Error('Use um repositório no formato https://github.com/usuario/repositorio. Não use links de perfil, arquivos ou outras redes.'); error.status = 400; throw error; };
  if (typeof value !== 'string' || value.length > 500) return fail();
  let text = value.trim();
  if (!text && optional) return '';
  if (/^github\.com\//i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); } catch (_) { return fail(); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) return fail();
  const match = url.pathname.match(/^\/([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]+)\/?$/i);
  if (!match) return fail();
  const repo = match[2].replace(/\.git$/i, '');
  if (!repo || ['.', '..'].includes(repo) || repo.length > 100 || ['settings','features','topics','collections','marketplace','orgs','users','login','signup','search','sponsors','notifications','explore','about','pricing','enterprise'].includes(match[1].toLowerCase())) return fail();
  return `https://github.com/${match[1]}/${repo}`;
}
module.exports = { repositoryURL };
