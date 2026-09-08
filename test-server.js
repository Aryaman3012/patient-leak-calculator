// Spawns server.js on a throwaway port and leads file, exercises the API, asserts.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 4899;
const LEADS = path.join(os.tmpdir(), 'leads-test-' + process.pid + '.json');
const base = `http://localhost:${PORT}`;

let fail = 0;
function ok(name, cond, extra = '') {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   ' + extra));
  if (!cond) fail++;
}

const post = (body, raw = false) =>
  fetch(base + '/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: raw ? body : JSON.stringify(body)
  }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

const readLeads = () => JSON.parse(fs.readFileSync(LEADS, 'utf8'));

const lead = (over = {}) => ({
  leadId: 'id-' + Math.random().toString(36).slice(2),
  name: 'Layla Haddad', clinic: 'Jumeirah Skin & Laser', phone: '050 123 4567',
  capturedAt: '2026-09-08T05:00:00.000Z', page: 'http://x/p', referrer: '',
  utm_source: 'meta', userAgent: 'test', ...over
});

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), LEADS_FILE: LEADS },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise(r => srv.stdout.once('data', r));

  try {
    // reachable anonymously — the thing Apps Script never managed
    const health = await fetch(base + '/api/leads').then(r => r.status);
    ok('API answers anonymously', health === 200, `http ${health}`);

    const page = await fetch(base + '/').then(r => ({ s: r.status, t: r.headers.get('content-type') }));
    ok('serves the calculator at /', page.s === 200 && /text\/html/.test(page.t), JSON.stringify(page));

    // happy path
    const a = await post(lead({ leadId: 'lead-a' }));
    ok('stores a valid lead', a.status === 200 && a.json.ok && a.json.total === 1, JSON.stringify(a));
    ok('leads.json created', fs.existsSync(LEADS));
    ok('file holds a JSON array', Array.isArray(readLeads()));

    const first = readLeads()[0];
    ok('phone normalised server-side', first.phone === '+971501234567', first.phone);
    ok('name kept', first.name === 'Layla Haddad');
    ok('receivedAt stamped by the server', !!first.receivedAt);
    ok('utm carried through', first.utm_source === 'meta');

    // appending, not overwriting
    await post(lead({ leadId: 'lead-b', name: 'Omar Aziz' }));
    await post(lead({ leadId: 'lead-c', name: 'Sara Nasser' }));
    ok('appends rather than replaces', readLeads().length === 3, `got ${readLeads().length}`);
    ok('earliest lead still first', readLeads()[0].leadId === 'lead-a');
    ok('newest lead last', readLeads()[2].name === 'Sara Nasser');

    // dedupe
    const dupe = await post(lead({ leadId: 'lead-a' }));
    ok('duplicate leadId rejected', dupe.json.duplicate === true && readLeads().length === 3);

    // validation
    const bad = [
      ['missing name', lead({ leadId: 'x1', name: '' })],
      ['missing clinic', lead({ leadId: 'x2', clinic: '  ' })],
      ['missing phone', lead({ leadId: 'x3', phone: '' })],
      ['junk phone', lead({ leadId: 'x4', phone: 'call me' })]
    ];
    for (const [label, body] of bad) {
      const r = await post(body);
      ok(`rejects ${label}`, r.status === 422 && !r.json.ok, JSON.stringify(r));
    }
    ok('rejected leads were not stored', readLeads().length === 3, `got ${readLeads().length}`);

    const malformed = await post('not json at all', true);
    ok('rejects malformed json', malformed.status === 400);

    // concurrency: read-modify-write must not lose leads
    const N = 25;
    await Promise.all(Array.from({ length: N }, (_, i) => post(lead({ leadId: 'c-' + i }))));
    const total = readLeads().length;
    ok(`${N} concurrent writes all land`, total === 3 + N, `expected ${3 + N}, got ${total}`);
    const ids = new Set(readLeads().map(l => l.leadId));
    ok('no lead lost or duplicated under load', ids.size === total);

    // file stays valid json throughout
    ok('file parses cleanly at the end', Array.isArray(readLeads()));
    ok('no temp file left behind', !fs.existsSync(LEADS + '.tmp'));

    // survives a restart
    srv.kill();
    await new Promise(r => setTimeout(r, 300));
    const srv2 = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(PORT), LEADS_FILE: LEADS },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise(r => srv2.stdout.once('data', r));
    const after = await post(lead({ leadId: 'after-restart' }));
    ok('keeps appending after a restart', after.json.total === 3 + N + 1, JSON.stringify(after.json));
    srv2.kill();
  } finally {
    srv.kill();
    try { fs.unlinkSync(LEADS); } catch {}
  }

  console.log('\n' + (fail ? fail + ' FAILING' : 'all checks pass'));
  process.exit(fail ? 1 : 0);
})();
