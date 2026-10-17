const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATES, validateProjectGoal, presentGoal } = require('./project-goals');
test('suggested goals use the trusted project roadmap instead of client-supplied stages', () => {
  const goal = validateProjectGoal({ mode: 'suggested', templateId: 'payments', steps: ['fake'], title: 'fake', dueDate: '2026-12-31', repository: 'https://github.com/user/payments.git' });
  assert.equal(goal.title, 'Sistema de pagamentos'); assert.deepEqual(goal.steps.map(step => step.label), TEMPLATES.find(t => t.id === 'payments').steps);
  assert.equal(goal.repository, 'https://github.com/user/payments'); assert.ok(goal.steps.every(step => !step.done));
});
test('custom project plans allow a free deadline and require a bounded checklist', () => {
  const input = { mode: 'custom', title: 'Meu app', description: 'Aprender construindo', steps: ['Planejar', 'Testar'], dueDate: '', repository: '' };
  assert.equal(validateProjectGoal(input).steps.length, 2);
  for (const bad of [{ ...input, title: '' }, { ...input, steps: [] }, { ...input, steps: Array(13).fill('Etapa') }, { ...input, dueDate: '2026-02-30' }, { ...input, repository: 'https://example.com' }]) assert.throws(() => validateProjectGoal(bad), { status: 400 });
});
test('project progress represents self-reported stages and excludes private database fields', () => {
  const goal = presentGoal({ id: 'goal', steps: [{ id: '1', label: 'Planejar', done: true }, { id: '2', label: 'Testar', done: false }], status: 'active', version: 2, githubToken: 'secret' });
  assert.equal(goal.progress, 50); assert.equal(goal.current, 1); assert.equal(goal.githubToken, undefined);
});
