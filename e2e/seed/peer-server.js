/**
 * Lets a Maestro flow act as the other people in a journey.
 *
 * Maestro's runScript can make HTTP calls but cannot run commands, so this
 * listens on 127.0.0.1 only and runs `peer.js` for it:
 *
 *   POST /run  { "args": ["bo", "send", "ada", "hello"], "background": false }
 *     -> { "code": 0, "stdout": "...", "stderr": "..." }
 *   background: true starts it and answers at once (calls that ring and hold).
 *   args ["phone", ...] run phone.js instead: quick adb taps on the emulator.
 *
 *   node e2e/seed/peer-server.js          # PORT [4130]
 *
 * e2e/maestro/scripts/peer.js is the flow side.
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PEER_PORT || 4130);
const PEER = path.join(__dirname, 'peer.js');
// args starting with "phone" go to phone.js (quick adb taps on the emulator).
const PHONE = path.join(__dirname, 'phone.js');
const children = new Set();

function run(args, background) {
  return new Promise((resolve) => {
    const argv = args[0] === 'phone' ? [PHONE, ...args.slice(1)] : [PEER, ...args];
    const child = spawn(process.execPath, argv, { env: process.env });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      children.delete(child);
      console.log(`[peer-server] ${args.join(' ')} -> ${code}${stderr ? ` ${stderr.trim().slice(0, 300)}` : ''}`);
      if (!background) resolve({ code, stdout, stderr });
    });
    if (background) resolve({ code: null, started: true, pid: child.pid });
  });
}

http
  .createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400).end('bad json');
        return;
      }
      const args = Array.isArray(parsed.args) ? parsed.args.map(String) : [];
      if (!args.length) {
        res.writeHead(400).end('args required');
        return;
      }
      const result = await run(args, Boolean(parsed.background));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[peer-server] on 127.0.0.1:${PORT}`));

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
