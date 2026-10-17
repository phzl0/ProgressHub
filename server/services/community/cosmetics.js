const CATALOG = {
  frames: [
    { id: 'essential', name: 'Essencial', description: 'Verde vivo. Sua identidade começa aqui.' },
    { id: 'circuit', name: 'Circuito', description: 'Trilhas e conexões inspiradas em placas eletrônicas.' },
    { id: 'terminal', name: 'Terminal', description: 'Cantos marcados, linhas precisas e espírito de código.' },
    { id: 'crystal', name: 'Cristal', description: 'Facetas verdes e violetas para destacar seu perfil.' },
    { id: 'prestige', name: 'Prestígio', description: 'Detalhes dourados em uma assinatura verde.' }
  ],
  covers: [
    { id: 'custom', name: 'Meu banner', description: 'Usar sua imagem enviada ou o fundo padrão.' },
    { id: 'aurora', name: 'Aurora', description: 'Luz esmeralda e profundidade em tons escuros.' },
    { id: 'matrix', name: 'Malha digital', description: 'Uma paisagem de linhas, pontos e conexões.' },
    { id: 'orbit', name: 'Órbita', description: 'Arcos, estrelas e uma nova perspectiva.' }
  ],
  titles: [
    { id: 'none', name: 'Sem título cosmético' },
    { id: 'learning', name: 'Aprendendo em público' },
    { id: 'building', name: 'Ideias em código' },
    { id: 'journey', name: 'Construindo meu caminho' }
  ]
};
const DEFAULT_APPEARANCE = { frame: 'essential', cover: 'custom', title: 'none' };
function validateAppearance(input) {
  if (!input || typeof input !== 'object' || !CATALOG.frames.some(item => item.id === input.frame) ||
    !CATALOG.covers.some(item => item.id === input.cover) || !CATALOG.titles.some(item => item.id === input.title)) {
    const error = new Error('Escolha uma moldura, capa e título da coleção disponível.'); error.status = 400; throw error;
  }
  return { frame: input.frame, cover: input.cover, title: input.title };
}
function appearanceFor(user) {
  try { return validateAppearance(user?.communityAppearance || DEFAULT_APPEARANCE); }
  catch (_) { return { ...DEFAULT_APPEARANCE }; }
}
module.exports = { CATALOG, DEFAULT_APPEARANCE, validateAppearance, appearanceFor };
