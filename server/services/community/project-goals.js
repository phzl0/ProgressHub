const crypto = require('crypto');
const { repositoryURL } = require('../github/repository-url');
const TEMPLATES = [
  { id: 'commerce', title: 'E-commerce', description: 'Construa uma loja com catálogo, carrinho e pedidos. Comece pequeno e evolua por etapas.', steps: ['Definir o escopo e modelar produtos e pedidos', 'Criar catálogo e detalhes dos produtos', 'Implementar carrinho e cálculo do total', 'Salvar pedidos e acompanhar seus estados', 'Testar o fluxo e documentar a instalação no README'] },
  { id: 'payments', title: 'Sistema de pagamentos', description: 'Simule cobranças e acompanhe pagamentos em ambiente de testes, sem movimentar dinheiro real.', steps: ['Modelar cobranças e estados de pagamento', 'Criar uma API para cobranças simuladas', 'Integrar um sandbox ou provedor fictício', 'Tratar confirmação, falhas e eventos repetidos', 'Testar os cenários e documentar o ambiente de testes'] },
  { id: 'inventory', title: 'Gestão de estoque', description: 'Controle produtos, entradas, saídas e disponibilidade com histórico de movimentações.', steps: ['Modelar produtos e movimentações', 'Criar cadastro e consulta de produtos', 'Registrar entradas e saídas sem saldo negativo', 'Exibir alertas de estoque baixo e histórico', 'Testar regras de saldo e documentar o projeto'] },
  { id: 'appointments', title: 'Sistema de agendamento', description: 'Organize serviços, horários e reservas, evitando conflitos de agenda.', steps: ['Definir serviços e disponibilidade', 'Criar consulta de horários livres', 'Implementar reserva e cancelamento', 'Impedir duas reservas para o mesmo horário', 'Testar conflitos e documentar o funcionamento'] }
];
function invalid(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function validateProjectGoal(input, now = new Date()) {
  if (!input || !['suggested', 'custom'].includes(input.mode)) invalid('Escolha projeto sugerido ou meta própria.');
  const template = input.mode === 'suggested' ? TEMPLATES.find(t => t.id === input.templateId) : null;
  if (input.mode === 'suggested' && !template) invalid('Escolha um projeto sugerido válido.');
  const title = template?.title || input.title;
  const description = template?.description || input.description || '';
  const labels = template?.steps || input.steps;
  if (typeof title !== 'string' || !title.trim() || title.length > 80 || typeof description !== 'string' || description.length > 600) invalid('Informe título (até 80 caracteres) e descrição (até 600).');
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > 12 || labels.some(label => typeof label !== 'string' || !label.trim() || label.length > 160)) invalid('Defina de 1 a 12 etapas, com até 160 caracteres cada.');
  const dueDate = input.dueDate || '';
  if (typeof dueDate !== 'string' || (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(new Date(`${dueDate}T00:00:00Z`).getTime()) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate))) invalid('Informe uma data válida ou deixe sem prazo.');
  return { mode: input.mode, templateId: template?.id || null, title: title.trim(), description: description.trim(),
    dueDate, repository: repositoryURL(input.repository || '', true), steps: labels.map((label, index) => ({ id: String(index + 1), label: label.trim(), done: false })) };
}
function presentGoal(goal) {
  if (!goal) return null;
  const current = goal.steps.filter(step => step.done).length;
  return { id: goal.id, mode: goal.mode, templateId: goal.templateId, title: goal.title, description: goal.description,
    dueDate: goal.dueDate, repository: goal.repository, steps: goal.steps, status: goal.status, version: goal.version,
    createdAt: goal.createdAt, completedAt: goal.completedAt || null, current, target: goal.steps.length,
    progress: Math.round(current / goal.steps.length * 100) };
}
async function readProjectGoal(db, user) {
  const record = await db.collection('projectGoals').findOne({ _id: user.githubId });
  return { templates: TEMPLATES, goal: presentGoal(record?.goal), history: (record?.history || []).map(presentGoal) };
}
async function createProjectGoal(db, user, input, now = new Date()) {
  const data = validateProjectGoal(input, now);
  const collection = db.collection('projectGoals');
  const previous = await collection.findOne({ _id: user.githubId });
  const goal = { ...data, id: crypto.randomUUID(), status: 'active', version: 1, createdAt: now, completedAt: null };
  try {
    await collection.updateOne({ _id: user.githubId, 'goal.status': { $ne: 'active' },
      ...(previous?.goal ? { 'goal.id': previous.goal.id, 'goal.version': previous.goal.version } : {}) }, {
      $set: { goal, history: [ ...(previous?.goal ? [previous.goal] : []), ...(previous?.history || []) ].slice(0, 10) }
    }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; invalid('Você já tem uma meta ativa. Conclua ou arquive a atual antes de começar outra.', 409); }
  return readProjectGoal(db, user);
}
async function updateProjectGoal(db, user, input, now = new Date()) {
  if (!input || typeof input.goalId !== 'string' || !Number.isInteger(input.version)) invalid('Meta inválida. Atualize a página.');
  const collection = db.collection('projectGoals');
  const record = await collection.findOne({ _id: user.githubId });
  const goal = record?.goal;
  if (!goal || goal.id !== input.goalId || goal.version !== input.version) invalid('Sua meta foi atualizada em outra consulta. Recarregue para continuar.', 409);
  if (goal.status === 'archived') invalid('Esta meta foi arquivada.', 409);
  if (input.action === 'step') {
    if (typeof input.done !== 'boolean' || !goal.steps.some(step => step.id === input.stepId)) invalid('Etapa inválida.');
    goal.steps = goal.steps.map(step => step.id === input.stepId ? { ...step, done: input.done } : step);
    goal.status = goal.steps.every(step => step.done) ? 'completed' : 'active';
    goal.completedAt = goal.status === 'completed' ? goal.completedAt || now : null;
  } else if (input.action === 'archive') { goal.status = 'archived'; }
  else if (input.action === 'details') {
    const validated = validateProjectGoal({ ...goal, mode: 'custom', steps: goal.steps.map(step => step.label), dueDate: input.dueDate, repository: input.repository }, now);
    goal.dueDate = validated.dueDate; goal.repository = validated.repository;
  } else invalid('Ação inválida.');
  const version = goal.version;
  goal.version += 1;
  const result = await collection.updateOne({ _id: user.githubId, 'goal.id': goal.id, 'goal.version': version }, { $set: { goal } });
  if (!result.modifiedCount) invalid('A meta mudou durante o salvamento. Recarregue para continuar.', 409);
  return readProjectGoal(db, user);
}
module.exports = { TEMPLATES, validateProjectGoal, presentGoal, readProjectGoal, createProjectGoal, updateProjectGoal };
