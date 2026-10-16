const { MongoClient } = require('mongodb');

let cachedDb = null;
let client = null;

async function connectToDatabase() {
  if (cachedDb) {
    try {
      // Verify connection is still alive
      await cachedDb.command({ ping: 1 });
      return cachedDb;
    } catch (error) {
      console.log('Cached connection lost, reconnecting...');
      cachedDb = null;
      if (client) await client.close();
    }
  }

  try {
    client = await MongoClient.connect(process.env.MONGODB_URI, {
      connectTimeoutMS: 10000, // Reduce from default 30000ms
      socketTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 5,
      retryWrites: true,
      retryReads: true
    });

    // Add keepAlive to handle serverless cold starts better
    client.on('connected', () => {
      console.log('MongoDB connected successfully');
    });

    client.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      cachedDb = null;
    });

    const db = client.db('usersDB');
    cachedDb = db;
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // If connection fails, clear cached connection
    cachedDb = null;
    if (client) await client.close();
    throw error;
  }
}

async function initializeIndexes() {
  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection('users');

    const indexes = await usersCollection.listIndexes().toArray().catch((error) => {
      if (error.code === 26) return [];
      throw error;
    });
    const googleIndex = indexes.find((index) => index.key?.googleId === 1);
    if (googleIndex && !googleIndex.partialFilterExpression) {
      await usersCollection.dropIndex(googleIndex.name);
    }
    await usersCollection.createIndex(
      { googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }
    );
    await usersCollection.createIndex(
      { githubId: 1 }, { unique: true, partialFilterExpression: { githubId: { $type: 'string' } } }
    );
    await usersCollection.createIndex({ 'githubStats.period': 1, 'githubStats.xp': -1, githubId: 1 });
    await db.collection('communitySeasons').createIndex({ githubId: 1, period: 1 }, { unique: true });
    await db.collection('communitySeasons').createIndex({ period: 1, status: 1, 'stats.xp': -1, githubId: 1 });
  } catch (error) {
    console.error('Error initializing database indexes:', error);
    throw error;
  }
}



process.on('SIGINT', async () => {
  if (client) {
    await client.close();
    cachedDb = null;
    process.exit(0);
  }
});

module.exports = {
  connectToDatabase,
  initializeIndexes
};
