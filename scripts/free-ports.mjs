/**
 * Frees the ports Siteline needs before `npm run dev` or a test run. If the Emulator Suite or the
 * dev server was left running (a closed terminal tab or a double Ctrl-C can orphan them), those
 * processes are stopped. Anything else on a port stops the start with a message saying what.
 *
 *   node scripts/free-ports.mjs          dev ports (firebase.json, app on 4200)
 *   node scripts/free-ports.mjs --test   test ports (firebase.test.json, app on 4300)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const test = process.argv.includes('--test');
const config = JSON.parse(
  readFileSync(
    new URL(`../${test ? 'firebase.test.json' : 'firebase.json'}`, import.meta.url),
    'utf8',
  ),
);
const ports = [
  ...Object.values(config.emulators)
    .flatMap((e) => (e && typeof e === 'object' ? [e.port, e.websocketPort] : []))
    .filter(Boolean),
  ...(test ? [4300] : [4200]),
  // Firebase's own defaults that firebase.json doesn't pin: Firestore's websocket and logging.
  ...(test ? [] : [9150, 4500]),
];

/** Our own processes: the emulators, the Firebase CLI and Siteline's dev server. */
const OURS = [
  /cloud-firestore-emulator/,
  /cloud-storage-rules-runtime/,
  /firebase-tools|\/\.bin\/firebase\b|firebase emulators/,
  /ng serve siteline/,
  /npm run (dev:apps|web|emulators|watch:functions|watch)\b/,
  /concurrently -n fn,seed,web/,
  /node build\.mjs --watch/,
];

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const command = (pid) => sh('ps', ['-o', 'command=', '-p', String(pid)]);
const parent = (pid) => Number(sh('ps', ['-o', 'ppid=', '-p', String(pid)])) || 0;
const children = (pid) =>
  sh('pgrep', ['-P', String(pid)])
    .split('\n')
    .filter(Boolean)
    .map(Number);

/** The process and every ancestor that is also ours, so the whole orphaned tree goes. */
function ourTree(pid) {
  let top = pid;
  for (let p = parent(pid); p > 1 && OURS.some((re) => re.test(command(p))); p = parent(p)) top = p;
  const all = [];
  const walk = (p) => {
    all.push(p);
    children(p).forEach(walk);
  };
  walk(top);
  return all;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const blockers = [];
const toStop = new Set();
for (const port of ports) {
  for (const pid of sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .filter(Boolean)
    .map(Number)) {
    const cmd = command(pid);
    if (OURS.some((re) => re.test(cmd))) ourTree(pid).forEach((p) => toStop.add(p));
    else blockers.push({ port, pid, cmd });
  }
}

// An orphaned `npm run dev:apps` (its parent, the Firebase CLI, is gone) holds no port once
// ng serve is stopped, but its function watcher keeps running; stop the whole tree.
for (const line of sh('ps', ['-eo', 'pid=,ppid=,command=']).split('\n')) {
  const [pid, ppid, ...rest] = line.trim().split(/\s+/);
  if (Number(ppid) === 1 && /npm run dev:apps/.test(rest.join(' ')))
    ourTree(Number(pid)).forEach((p) => toStop.add(p));
}

if (blockers.length) {
  for (const b of blockers) {
    console.error(
      `Port ${b.port} is used by another program (pid ${b.pid}): ${b.cmd.slice(0, 120)}`,
    );
  }
  console.error(`Stop it, or change the port in ${test ? 'firebase.test.json' : 'firebase.json'}.`);
  process.exit(1);
}

if (toStop.size) {
  console.log(`Stopping ${toStop.size} leftover Siteline process(es) from an earlier run...`);
  for (const pid of toStop) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  for (let i = 0; i < 30 && [...toStop].some(alive); i++) await sleep(200);
  for (const pid of toStop) {
    if (alive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
}
