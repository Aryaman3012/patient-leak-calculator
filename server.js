#!/usr/bin/env node
/**
 * Serves the calculator and stores leads.
 *
 *   node server.js            # http://localhost:4891
 *   PORT=8080 node server.js
 *
 * Leads are appended to leads.json as a JSON array. No dependencies, no build.
 */

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT) || 4891;
const ROOT = __dirname;
const LEADS_FILE = process.env.LEADS_FILE || path.join(ROOT, 'leads.json');
const MAX_BODY = 64 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* ── storage ─────────────────────────────────────────────────────────── */

// Every write goes through this chain, so two leads arriving together can never
// interleave a read-modify-write and lose one of themselves.
let writeChain = Promise.resolve();

async function readLeads() {
  try {
    const raw = await fsp.readFile(LEADS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    // A corrupt file must not silently become an empty one.
    if (err instanceof SyntaxError) {
      const backup = LEADS_FILE + '.corrupt-' + Date.now();
      await fsp.rename(LEADS_FILE, backup);
      console.error(`leads.json was unreadable, moved to ${path.basename(backup)}`);
      return [];
    }
    throw err;
  }
}

async function appendLead(lead) {
  const result = writeChain.then(async () => {
    const leads = await readLeads();

    // The page retries anything it could not confirm, so the same lead can arrive twice.
    if (lead.leadId && leads.some(l => l.leadId === lead.leadId)) {
      return { stored: false, duplicate: true, total: leads.length };
    }

    leads.push(lead);

    // Write to a temp file and rename, so a crash mid-write cannot truncate leads.json.
    const tmp = LEADS_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(leads, null, 2) + '\n', 'utf8');
    await fsp.rename(tmp, LEADS_FILE);

    return { stored: true, duplicate: false, total: leads.length };
  });

  writeChain = result.catch(() => {});   // one failed write must not break the chain
  return result;
}

/* ── validation (never trust the client) ─────────────────────────────── */

function normalisePhone(raw) {
  const t = String(raw == null ? '' : raw).trim();
  if (!t) return null;
  const international = t.charAt(0) === '+';
  let d = t.replace(/\D/g, '');
  if (!d) return null;
  if (!international) {
    if (/^0\d{8,9}$/.test(d)) d = '971' + d.slice(1);
    else if (/^[2-9]\d{7,8}$/.test(d)) d = '971' + d;
  }
  if (d.length < 8 || d.length > 15) return null;
  return '+' + d;
}

const str = (v, max = 500) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, max);

function buildLead(body, req) {
  const name = str(body.name, 120);
  const clinic = str(body.clinic, 160);
  const phone = normalisePhone(body.phone);

  if (name.length < 2) return { error: 'name is required' };
  if (clinic.length < 2) return { error: 'clinic is required' };
  if (!phone) return { error: 'a valid phone number is required' };

  return {
    lead: {
      leadId: str(body.leadId, 64) || null,
      name,
      clinic,
      phone,
      capturedAt: str(body.capturedAt, 40) || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      page: str(body.page, 500),
      referrer: str(body.referrer, 500),
      utm_source: str(body.utm_source, 120),
      utm_medium: str(body.utm_medium, 120),
      utm_campaign: str(body.utm_campaign, 120),
      utm_term: str(body.utm_term, 120),
      utm_content: str(body.utm_content, 120),
      userAgent: str(body.userAgent, 400) || str(req.headers['user-agent'], 400)
    }
  };
}

/* ── http ────────────────────────────────────────────────────────────── */

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/leak-calculator.html';

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end('forbidden'); return; }

  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/leads') {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET') return send(res, 200, { ok: true, service: 'lead intake' });
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { ok: false, error: 'bad json' });
    }

    const built = buildLead(body, req);
    if (built.error) return send(res, 422, { ok: false, error: built.error });

    try {
      const r = await appendLead(built.lead);
      console.log(
        `${r.duplicate ? 'duplicate' : 'lead'}  ${built.lead.name} · ${built.lead.clinic} · ${built.lead.phone}  (${r.total} total)`
      );
      return send(res, 200, { ok: true, duplicate: r.duplicate, total: r.total });
    } catch (err) {
      console.error('failed to store lead:', err);
      return send(res, 500, { ok: false, error: 'could not store lead' });
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  const existing = fs.existsSync(LEADS_FILE) ? JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')).length : 0;
  console.log(`calculator   http://localhost:${PORT}`);
  console.log(`leads        ${path.basename(LEADS_FILE)} (${existing} stored)`);
});
