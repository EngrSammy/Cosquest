// Optional: let a peer really join a call's LiveKit room and talk (a soft
// tone), so the phone shows a connected call with someone speaking instead of
// "Connecting" forever. Needs @livekit/rtc-node, which is NOT a dependency of
// the app or the backend: install it anywhere and point LKBOT_DIR at it, e.g.
//   mkdir -p ~/lkbot && cd ~/lkbot && npm i @livekit/rtc-node
//   LKBOT_DIR=~/lkbot node e2e/seed/peer.js bo call ada
// Without it, joinMedia() returns null and calls carry signalling only.
const path = require('path');

const DEFAULT_DIR = path.join(process.env.HOME || '', 'cq-work/cx-journeys/tools/lkbot');

function loadRtc() {
  const dir = process.env.LKBOT_DIR || DEFAULT_DIR;
  try {
    return require(require.resolve('@livekit/rtc-node', { paths: [dir] }));
  } catch {
    return null;
  }
}

// The backend hands out the URL the phone uses (the emulator reaches this
// machine as 10.0.2.2); from this machine it is loopback.
const hostUrl = (url) => String(url || '').replace('://10.0.2.2:', '://127.0.0.1:');

async function joinMedia(livekitUrl, token, { hz = 330, log = () => {} } = {}) {
  if (!livekitUrl || !token) return null;
  const rtc = loadRtc();
  if (!rtc) return null;
  const { Room, AudioSource, LocalAudioTrack, AudioFrame, TrackPublishOptions, TrackSource } = rtc;
  const room = new Room();
  await room.connect(hostUrl(livekitUrl), token, { autoSubscribe: false, dynacast: false });
  const rate = 48000;
  const samples = rate / 100; // 10 ms frames
  const source = new AudioSource(rate, 1);
  const track = LocalAudioTrack.createAudioTrack('peer-tone', source);
  const opts = new TrackPublishOptions();
  opts.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(track, opts);
  log('media', { room: room.name, publishing: `${hz} Hz tone` });
  let stopped = false;
  let n = 0;
  (async () => {
    while (!stopped) {
      const pcm = new Int16Array(samples);
      // 1 s of tone, 1 s of quiet: looks like someone talking
      const on = Math.floor(n / rate) % 2 === 0;
      for (let i = 0; i < samples; i += 1, n += 1) pcm[i] = on ? Math.round(3000 * Math.sin((2 * Math.PI * hz * n) / rate)) : 0;
      try {
        await source.captureFrame(new AudioFrame(pcm, rate, 1, samples));
      } catch {
        break;
      }
    }
  })();
  return async () => {
    stopped = true;
    try {
      await room.disconnect();
    } catch {}
  };
}

module.exports = { joinMedia };
