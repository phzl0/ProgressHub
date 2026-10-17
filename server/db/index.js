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
    await db.collection('missionEvents').createIndex({ githubId: 1, at: 1 });
    await db.collection('missionEvents').createIndex({ kind: 1, at: 1 });
    await db.collection('missionRewards').createIndex({ githubId: 1, creditedPeriod: 1 });
    await db.collection('missionRewards').createIndex({ githubId: 1, awardedAt: -1 });
    await db.collection('achievementRewards').createIndex({ githubId: 1, creditedPeriod: 1 });
    await db.collection('achievementRewards').createIndex({ githubId: 1, status: 1 });
    await db.collection('communityComments').createIndex({ postId: 1, rootId: 1, createdAt: -1, _id: -1 });
    await db.collection('communityHelpComments').createIndex({ helpId: 1, rootId: 1, createdAt: -1, _id: -1 });
    await db.collection('communityReactions').createIndex({ kind: 1, targetId: 1, githubId: 1 });
    await db.collection('communityHelpSaves').createIndex({ githubId: 1, helpId: 1 });
    await db.collection('communityHelpComments').createIndex({ helpId: 1, createdAt: -1, _id: -1 });
    await db.collection('communityGroups').createIndex({ type: 1, owner: 1, _id: -1 });
    await db.collection('communityNotifications').createIndex({ recipient: 1, createdAt: -1 });
    await db.collection('communityGroups').createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } });
    await db.collection('communityAttachments').createIndex({ requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } });
    await db.collection('communityAttachments').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('communityAttachments').createIndex({ githubId: 1, messageId: 1 });
    await db.collection('communityComments').createIndex({ postId: 1, createdAt: -1, _id: -1 });
    await db.collection('communityPosts').createIndex({ requestKey: 1 }, { unique: true });
    await db.collection('communityComments').createIndex({ postId: 1, _id: -1 });
    await db.collection('communityLikes').createIndex({ postId: 1 });
    await db.collection('communityGroups').createIndex({ members: 1 });
    await db.collection('communityMessages').createIndex({ channel: 1, _id: -1 });
    await db.collection('communityMessages').createIndex({ requestKey: 1 }, { unique: true });
    await db.collection('communityPools').createIndex({ status: 1, closesAt: 1 });
    await db.collection('communityPoolShares').createIndex({ poolId: 1, status: 1 });
    await db.collection('communityPoolShares').createIndex({ githubId: 1, creditedPeriod: 1 });
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
