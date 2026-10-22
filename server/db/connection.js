// Share one pool and one in-flight connection attempt per process. The MongoDB
// driver handles transient disconnections; a ping on every request adds latency.
function createConnectionManager(open, dbName = 'usersDB') {
  let client;
  let pending;
  let closing = false;
  async function connect(uri) {
    if (closing) throw new Error('Database connection is closing');
    if (client) return client.db(dbName);
    if (!pending) {
      pending = (async () => {
        try {
          const opened = await open(uri, {
            connectTimeoutMS: 10000, socketTimeoutMS: 10000,
            serverSelectionTimeoutMS: 10000, maxPoolSize: 10, minPoolSize: 0,
            retryWrites: true, retryReads: true
          });
          client = opened;
          return opened.db(dbName);
        } finally { pending = null; }
      })();
    }
    return pending;
  }
  async function close() {
    closing = true;
    try { if (pending) await pending; } catch (_) { /* unsuccessful startup */ }
    if (client) { const active = client; client = null; await active.close(); }
  }
  return { connect, close };
}
module.exports = { createConnectionManager };
