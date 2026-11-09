const { AccessToken } = require('livekit-server-sdk');

function getLivekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    const error = new Error(
      'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.'
    );
    error.status = 503;
    throw error;
  }

  return { url, apiKey, apiSecret };
}

async function createCallToken({ userId, username, name, roomName }) {
  const { apiKey, apiSecret } = getLivekitConfig();
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: String(userId),
    name: name || username || 'User',
    ttl: '2h',
  });

  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  return accessToken.toJwt();
}

function getLivekitUrl() {
  return getLivekitConfig().url;
}

module.exports = { createCallToken, getLivekitUrl };
