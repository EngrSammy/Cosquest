require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const apiRoutes = require('./src/routes');
const shareRoutes = require('./src/routes/shareRoutes');
const { connectDB, disconnectDB } = require('./src/config/db');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');
const { asyncHandler } = require('./src/utils/asyncHandler');
const { renderPostShare, renderChatShare } = require('./src/controllers/contentShareController');
const { initSocket, closeSocket, getIO } = require('./src/realtime/socket');
const sparks = require('./src/sparks');

function buildApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // Apple OAuth callback uses form_post.
  app.use(cookieParser(process.env.OAUTH_COOKIE_SECRET || process.env.JWT_SECRET));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'cosquest-backend' }));

  // Sparks: the on-device model manifest. The app's SDK reads `${API}/v1/model`;
  // the manifest and model files are hosted by the Sparks team, this only
  // points there (SPARKS_MODEL_MANIFEST_URL, see SPARKS_INTEGRATION.md).
  app.get('/v1/model', (req, res) => {
    const url = process.env.SPARKS_MODEL_MANIFEST_URL;
    if (!url) return res.status(404).json({ error: 'SPARKS_MODEL_MANIFEST_URL is not set.' });
    // Keep the query: SDK 1.2 asks with ?mq=5 to be offered the small model for 3-4 GB phones.
    const q = req.originalUrl.indexOf('?');
    return res.redirect(302, q === -1 ? url : url + (url.includes('?') ? '&' : '?') + req.originalUrl.slice(q + 1));
  });

  // Shareable profile pages - real HTML with Open Graph tags, not JSON, so a
  // link pasted into Instagram/Facebook/etc. renders a rich preview.
  app.use('/u', shareRoutes);
  app.get('/p/:postId', asyncHandler(renderPostShare));
  app.get('/c/:conversationId', renderChatShare);
  app.get('/c/:conversationId/m/:messageId', renderChatShare);

  app.use('/api', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Connects to MongoDB and Redis, then starts listening. Exported (rather
 * than just run at the bottom of this file) so test/runWithMemoryMongo.js
 * can boot the exact same app against an ephemeral in-memory MongoDB and
 * Redis instead of real ones - see README "Testing".
 */
async function startServer() {
  await connectDB();
  await connectRedis();
  const app = buildApp();
  const PORT = process.env.PORT;

  // Socket.IO needs the raw http.Server (not the Express app) so it can
  // upgrade HTTP connections to WebSocket on the same port - REST and
  // real-time traffic share one listener, no second port to expose/CORS.
  const httpServer = http.createServer(app);
  await initSocket(httpServer);
  // Sparks module (ESM, loaded with import()): after Mongo and Socket.IO are up.
  await sparks.init({ getIO });

  return new Promise((resolve) => {
    httpServer.listen(PORT, () => {
      console.log(`CosQuest backend listening on http://localhost:${PORT}`);
      resolve(httpServer);
    });
  });
}

/**
 * On SIGTERM/SIGINT (Ctrl+C locally; also what a process manager or a
 * container/orchestrator platform sends before killing a dyno/pod during a
 * deploy or restart) close things in dependency order: stop accepting new
 * HTTP/WebSocket connections first, then the adapter's Redis pub/sub
 * connections, then the database connections. Without this, every restart
 * just abandons those connections instead of closing them, which is what
 * produced the dangling-connection errors this same shutdown path fixes in
 * test/runWithMemoryMongo.js.
 */
function registerGracefulShutdown(httpServer) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down...`);
    try {
      sparks.stop();
      await new Promise((resolve) => httpServer.close(resolve));
      await closeSocket();
      await disconnectRedis();
      await disconnectDB();
      console.log('[server] Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[server] Error during shutdown:', err.message);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  startServer()
    .then(registerGracefulShutdown)
    .catch((err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
}

module.exports = { buildApp, startServer };
