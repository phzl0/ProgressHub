const { MongoClient } = require('mongodb');

const { createConnectionManager } = require('./connection');
const connection = createConnectionManager((uri, options) => MongoClient.connect(uri, options));
const connectToDatabase = () => connection.connect(process.env.MONGODB_URI);

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
    await db.collection('communityProjectReactions').createIndex({projectId:1,githubId:1});
    for (const name of ['communityProjects','communityEvents','communityAnnouncements']) await db.collection(name).createIndex({requestKey:1},{unique:true});
    await db.collection('communityProjects').createIndex({owner:1,_id:-1});
    await db.collection('communityProjects').createIndex({status:1,tags:1,_id:-1});
    await db.collection('communityProjectApplications').createIndex({projectId:1,status:1});
    await db.collection('communityProjectUpdates').createIndex({projectId:1,createdAt:-1});
    await db.collection('communityProjectFollows').createIndex({githubId:1,projectId:1});
    await db.collection('communityUserFollows').createIndex({githubId:1,targetId:1});
    await db.collection('communityPostSaves').createIndex({githubId:1,postId:1});
    await db.collection('communityEvents').createIndex({status:1,endsAt:1});
    await db.collection('communityEventEntries').createIndex({eventId:1,status:1});
    await db.collection('communityAnnouncements').createIndex({status:1,dueAt:1});
    await db.collection('communitySeasons').createIndex({ githubId: 1, period: 1 }, { unique: true });
    await db.collection('communitySeasons').createIndex({ period: 1, status: 1, 'stats.xp': -1, githubId: 1 });
    await db.collection('missionEvents').createIndex({ githubId: 1, at: 1 });
    await db.collection('missionEvents').createIndex({ kind: 1, at: 1 });
    await db.collection('missionRewards').createIndex({ githubId: 1, creditedPeriod: 1 });
    await db.collection('missionRewards').createIndex({ githubId: 1, awardedAt: -1 });
    await db.collection('achievementRewards').createIndex({ githubId: 1, creditedPeriod: 1 });
    await db.collection('achievementRewards').createIndex({ githubId: 1, status: 1 });
    for(const [name,field,actor] of [['communityPosts','createdAt','githubId'],['communityMessages','createdAt','githubId'],['communityComments','createdAt','githubId'],['communityHelpComments','createdAt','githubId'],['communityGroups','createdAt','owner'],['missionRewards','awardedAt','githubId'],['achievementRewards','awardedAt','githubId'],['communityPoolShares','awardedAt','githubId']])await db.collection(name).createIndex({[field]:1,[actor]:1});
    await db.collection('communitySeasons').createIndex({period:1});
    await db.collection('users').createIndex({createdAt:1,githubId:1});
    await db.collection('communityGroups').createIndex({type:1,helpStatus:1,createdAt:1});
    await db.collection('communityInboxState').createIndex({githubId:1,notificationId:1},{unique:true});
    await db.collection('communityActivityDays').createIndex({githubId:1,day:1},{unique:true});
    await db.collection('communityActivityDays').createIndex({lastAt:1,githubId:1});
    await db.collection('communityAdminAudit').createIndex({ sequence: -1 });
    await db.collection('communityReports').createIndex({ status: 1, _id: -1 });
    await db.collection('communityBlocks').createIndex({ githubId: 1, blockedId: 1 });
    await db.collection('communityGroupMutes').createIndex({ githubId: 1, groupId: 1 });
    await db.collection('communityReports').createIndex({ requestKey: 1 }, { unique: true });
    await db.collection('communityReports').createIndex({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { status: 'received' } });
    await db.collection('communityReports').createIndex({ reporterId: 1, _id: -1 });
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



module.exports = {
  connectToDatabase,
  initializeIndexes,
  closeDatabase: () => connection.close()
};
