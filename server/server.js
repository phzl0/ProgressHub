const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const { apiError } = require('./middleware/runtime-safety');
const settings = require('./config/production').serverSettings();
const secret = settings.secret;
const app = express();
app.disable('x-powered-by');

app.set('trust proxy', settings.trustProxy);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
app.use('/api/community/profile', express.json({ limit: '450kb' }));
app.use('/api/community/feed', express.json({ limit: '450kb' }));
app.use('/api/community/social', express.json({ limit: '450kb' }));
app.use(express.json());

const { connectToDatabase, initializeIndexes, closeDatabase } = require('./db');

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGO_URI not found in environment variables');
  process.exit(1);
}

// Session middleware with MongoDB store
app.use(
  session({
    secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: 'sessions',
      dbName: settings.dbName,
      autoRemove: 'native',
      touchAfter: 24 * 3600
    }),
    cookie: settings.cookie
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Update CORS configuration
app.use(
  cors({
    origin: settings.client,
    credentials: true, // Allow credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
    exposedHeaders: ['Content-Type', 'Authorization'] // Exposed headers
  })
);

// Require passport setup
require('./config/passport-setup');

app.get('/api/health', async (req, res) => {
  try { await (await connectToDatabase()).command({ ping: 1 }); res.json({ status: 'ok' }); }
  catch (_) { res.status(503).json({ status: 'unavailable' }); }
});
app.use('/api', require('./routes/active'));
app.use(apiError);

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await connectToDatabase();
    await initializeIndexes();
    const worker = settings.workerMode === 'embedded'
      ? await require('./community-worker').startWorker({ initialize: false }) : null;
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      // Stop accepting requests and finish background writes before closing MongoDB.
      const requestsClosed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      Promise.all([requestsClosed, worker?.stop()]).then(async () => {
        await closeDatabase(); clearTimeout(deadline); process.exit(0);
      }).catch(() => process.exit(1));
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  } catch (error) {
    console.error('Failed to start server; check production configuration and database connectivity.');
    process.exit(1);
  }
};

if (require.main === module) startServer();
module.exports = { app, startServer };
