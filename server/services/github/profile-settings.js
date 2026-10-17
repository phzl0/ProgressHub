const MAX_BANNER_BYTES = 300 * 1024;
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Perfil inválido.');
  const { bio = '', links = [], banner = '', projects = [] } = input;
  if (typeof bio !== 'string' || bio.length > 300) invalid('A descrição deve ter até 300 caracteres.');
  if (!Array.isArray(links) || links.length > 2) invalid('Adicione no máximo dois links.');
  const cleanLinks = links.map(link => {
    if (!link || typeof link.label !== 'string' || !link.label.trim() || link.label.length > 30 || typeof link.url !== 'string' || link.url.length > 500) invalid('Informe nome (até 30 caracteres) e endereço para cada link.');
    let url;
    try { url = new URL(link.url); } catch (_) { invalid('Endereço de link inválido.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('Use links HTTP ou HTTPS sem credenciais.');
    return { label: link.label.trim(), url: url.href };
  });
  if (typeof banner !== 'string' || banner.length > Math.ceil(MAX_BANNER_BYTES / 3) * 4 + 30) invalid('O banner deve ter até 300 KB após o ajuste.');
  if (banner) {
    if (!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(banner)) invalid('Selecione uma imagem válida para o banner.');
    const bytes = Buffer.from(banner.split(',')[1], 'base64');
    if (bytes.length > MAX_BANNER_BYTES || bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') invalid('Formato do banner inválido.');
  }
  if (!Array.isArray(projects) || projects.length > 3) invalid('Destaque até três projetos.');
  const cleanProjects = projects.map(project => {
    if (!project || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 60 ||
        typeof project.description !== 'string' || project.description.length > 180 ||
        !['star', 'fire', 'bolt', 'code', 'rocket', 'flag'].includes(project.icon) ||
        typeof project.url !== 'string' || project.url.length > 500) invalid('Confira nome, descrição, ícone e link do projeto.');
    let url;
    try { url = new URL(project.url); } catch (_) { invalid('Endereço de projeto inválido.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('Use um endereço HTTP ou HTTPS para o projeto.');
    return { name: project.name.trim(), description: project.description.trim(), icon: project.icon, url: url.href };
  });
  return { bio: bio.trim(), links: cleanLinks, banner, projects: cleanProjects };
}
function profileSettings(user) {
  // Explicit allowlist for persisted custom fields.
  try { return validateProfile(user?.communityProfile || {}); }
  catch (_) { return { bio: '', links: [], banner: '', projects: [] }; }
}
module.exports = { validateProfile, profileSettings };
