// One scheduler per process. MongoDB leases remain the cross-process authority.
function createWorkerScheduler({ sync, dispatch, setInterval: every = setInterval, clearInterval: cancel = clearInterval, onError = () => {} }) {
  let stopped = false;
  const pending = new Set();
  const busy = new Set();
  function run(name, task) {
    if (stopped || busy.has(name)) return;
    busy.add(name);
    const job = Promise.resolve().then(task).catch(() => onError(name)).finally(() => {
      busy.delete(name); pending.delete(job);
    });
    pending.add(job);
  }
  const syncTimer = every(() => run('sync', sync), 10 * 60 * 1000);
  const dispatchTimer = every(() => run('dispatch', dispatch), 60000);
  run('sync', sync);
  return {
    async stop() {
      stopped = true;
      cancel(syncTimer); cancel(dispatchTimer);
      await Promise.all([...pending]);
    }
  };
}
module.exports = { createWorkerScheduler };
