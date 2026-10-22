require('dotenv').config();
const crypto = require('crypto');
const { connectToDatabase, initializeIndexes } = require('./db');
const { periodFor, periodBounds } = require('./services/github/scoring');
const { ensureLegacy, syncSeason, finalizeSeason } = require('./services/github/league');
const { ensurePool, settlePools } = require('./services/community/pool');
const INTERVAL = 10 * 60 * 1000;
let running = false;
let stopping = false;

async function runCycle() {
  if (running || stopping) return;
  running = true;
  let db;
  let heartbeat;
  let ownsLease = false;
  const owner = crypto.randomUUID();
  try {
    db = await connectToDatabase();
    const jobs = db.collection('communityJobs');
    try { await jobs.updateOne({ _id: 'github-sync' }, { $setOnInsert: { leaseUntil: new Date(0) } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    const acquired = await jobs.updateOne({ _id: 'github-sync', leaseUntil: { $lt: new Date() } }, {
      $set: { owner, leaseUntil: new Date(Date.now() + 180000), startedAt: new Date(), status: 'running' }
    });
    if (!acquired.modifiedCount) return;
    ownsLease = true;
    heartbeat = setInterval(async () => {
      try {
        const result = await jobs.updateOne({ _id: 'github-sync', owner }, { $set: { leaseUntil: new Date(Date.now() + 180000) } });
        if (!result.matchedCount) ownsLease = false;
      } catch (_) { ownsLease = false; }
    }, 30000);
    await require('./services/community/community-growth').dispatchAnnouncements(db);
    await ensurePool(db);
    let synced = 0;
    let failures = 0;
    const users = db.collection('users');
    const cursor = users.find({ githubId: { $type: 'string' }, githubToken: { $type: 'string' } });
    for await (const user of cursor) {
      if (!ownsLease || stopping) break;
      await ensureLegacy(db, user);
      const past = await db.collection('communitySeasons').find({ githubId: user.githubId, status: 'open', period: { $lt: periodFor() } }).sort({ period: 1 }).toArray();
      if (user.backgroundRetryAt && new Date(user.backgroundRetryAt) > new Date()) continue;
      // Reconcile the last available snapshot after a month ends, before freezing results.
      for (const season of past) {
        if (!ownsLease || stopping) break;
        if (season.reconciledAt && Date.now() - new Date(season.reconciledAt).getTime() < INTERVAL) continue;
        try { await syncSeason(db, user, season.period, { force: true }); }
        catch (_) { failures += 1; }
      }
      if (!ownsLease || stopping) break;
      if (!user.githubStats || user.githubStats.period !== periodFor() || Date.now() - new Date(user.githubStats.syncedAt).getTime() >= INTERVAL) {
        try { const result = await syncSeason(db, user); if (!result.skipped) synced += 1; }
        catch (error) {
          if (error.status !== 429) {
            failures += 1;
            await users.updateOne({ _id: user._id }, { $set: {
              backgroundSyncError: 'Não foi possível atualizar pelo GitHub. A pontuação salva foi preservada.',
              backgroundRetryAt: new Date(Date.now() + INTERVAL)
            } });
          }
        }
      }
    }
    if (ownsLease && !stopping) {
      const pending = await db.collection('communitySeasons').distinct('period', { period: { $lt: periodFor() }, status: 'open' });
      const interrupted = await db.collection('communitySeasonResults').find({ status: 'closing' }).toArray();
      for (const period of new Set([...pending, ...interrupted.map((item) => item._id)])) {
        if (!ownsLease || stopping) break;
        await finalizeSeason(db, period);
      }
      await settlePools(db);
      // No token or raw API error goes into logs or job status.
      await jobs.updateOne({ _id: 'github-sync', owner }, { $set: { status: failures ? 'partial' : 'ok',
        completedAt: new Date(), synced, failures } });
      console.log(`Community sync cycle finished: ${synced} updated; ${failures} retryable failures.`);
    }
  } catch (_) { console.error('Community worker cycle failed; next cycle will retry.'); }
  finally {
    if (heartbeat) clearInterval(heartbeat);
    if (db && ownsLease) await db.collection('communityJobs').updateOne({ _id: 'github-sync', owner }, { $set: { leaseUntil: new Date(0) } }).catch(() => {});
    running = false;
  }
}
let workerPromise;
function startWorker({ initialize = true } = {}) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    if (process.env.NODE_ENV === 'production') require('./config/production').validateWorker();
    if (initialize) await initializeIndexes();
    const { createWorkerScheduler } = require('./services/community/worker-scheduler');
    const scheduler = createWorkerScheduler({
      sync: runCycle,
      dispatch: async () => {
        if (!stopping) await require('./services/community/community-growth').dispatchAnnouncements(await connectToDatabase());
      },
      onError: () => console.error('Community background task failed; next cycle will retry.')
    });
    console.log('Community background sync enabled while this process is active.');
    return { async stop() { stopping = true; await scheduler.stop(); } };
  })().catch(error => { workerPromise = undefined; throw error; });
  return workerPromise;
}
async function main() {
  try {
    const worker = await startWorker();
    let closing = false;
    const stop = async () => {
      if (closing) return;
      closing = true;
      const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref();
      try { await worker.stop(); await require('./db').closeDatabase(); clearTimeout(deadline); process.exit(0); }
      catch (_) { process.exit(1); }
    };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  } catch (_) {
    console.error('Community worker could not initialize; process will restart.');
    process.exit(1);
  }
}
if (require.main === module) main();
module.exports = { startWorker };
