// Preload for offline tests (node --import). Any connection that leaves this machine is
// refused and makes the test process fail, even if the test swallows the error.
// Browsers started through Playwright resolve only loopback names.
import net from 'node:net';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);
const local = (host) => !host || LOOPBACK.has(String(host).replace(/^\[|\]$/g, ''));
let violations = 0;
function refuse(host) {
  violations++;
  process.stderr.write('OFFLINE-VERSTOSS: Verbindung zu ' + host + ' verweigert\n');
  const error = new Error('Offline test: network access to ' + host + ' is blocked');
  error.code = 'ENL_OFFLINE';
  return error;
}
process.on('exit', () => { if (violations) process.exitCode = 1; });

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input?.url ?? input);
  if (/^https?:$/.test(url.protocol) && !local(url.hostname)) throw refuse(url.hostname);
  return realFetch(input, init);
};
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node passes either (options, cb), (port, host, cb), (path, cb) or its normalised array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' && first !== null ? first
    : typeof first === 'number' ? { port: first, host: typeof args[1] === 'string' ? args[1] : undefined } : { path: first };
  if (!options.path && !local(options.host)) throw refuse(options.host);
  return realConnect.apply(this, args);
};

try {
  const { chromium } = await import('playwright');
  const launch = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) => launch({ ...options, args: [...(options.args || []), '--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] });
} catch (e) {
  if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e; // node-only suites run without Playwright
}
