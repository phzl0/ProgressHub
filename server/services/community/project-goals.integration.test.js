const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { createProjectGoal, updateProjectGoal, readProjectGoal } = require('./project-goals');
test('MongoDB: one active project, saved checklist, optimistic concurrency and retained history', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = await MongoClient.connect(process.env.MONGODB_TEST_URI);
  const db = client.db(`questlog_project_goals_${new ObjectId().toHexString()}`);
  const user = { githubId: '42' };
  const input = { mode: 'custom', title: 'App', description: 'Meu projeto', steps: ['Planejar', 'Entregar'], dueDate: '', repository: '' };
  try {
    const attempts = await Promise.allSettled([createProjectGoal(db, user, input), createProjectGoal(db, user, input)]);
    assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
    let { goal } = await readProjectGoal(db, user);
    const firstId = goal.id;
    const staleVersion = goal.version;
    let result = await updateProjectGoal(db, user, { action: 'step', goalId: goal.id, version: goal.version, stepId: '1', done: true });
    assert.equal(result.goal.progress, 50);
    await assert.rejects(updateProjectGoal(db, user, { action: 'step', goalId: goal.id, version: staleVersion, stepId: '2', done: true }), { status: 409 });
    goal = result.goal;
    result = await updateProjectGoal(db, user, { action: 'step', goalId: goal.id, version: goal.version, stepId: '2', done: true });
    assert.equal(result.goal.status, 'completed');
    await createProjectGoal(db, user, { mode: 'suggested', templateId: 'inventory' });
    result = await readProjectGoal(db, user);
    assert.equal(result.goal.status, 'active'); assert.equal(result.history[0].id, firstId); assert.equal(result.history[0].status, 'completed');
    assert.equal((await readProjectGoal(db, { githubId: '43' })).goal, null);
    assert.equal(await db.collection('missionRewards').countDocuments({}), 0);
  } finally { await db.dropDatabase(); await client.close(); }
});
