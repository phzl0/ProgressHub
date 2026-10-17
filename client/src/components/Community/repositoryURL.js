export const REPOSITORY_HELP = 'Use https://github.com/usuario/repositorio. Links de perfil, arquivos e outras redes não são aceitos.';
export function normalizeRepositoryURL(value) {
  let text = String(value || '').trim();
  if (/^github\.com\//i.test(text)) text = `https://${text}`;
  let url;
  try { url = new URL(text); } catch (_) { throw new Error(REPOSITORY_HELP); }
  const match = url.pathname.match(/^\/([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]+)\/?$/i);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match) throw new Error(REPOSITORY_HELP);
  const repo = match[2].replace(/\.git$/i, '');
  if (!repo || ['.', '..'].includes(repo) || repo.length > 100 || ['settings','features','topics','collections','marketplace','orgs','users','login','signup','search','sponsors','notifications','explore','about','pricing','enterprise'].includes(match[1].toLowerCase())) throw new Error(REPOSITORY_HELP);
  return `https://github.com/${match[1]}/${repo}`;
}
