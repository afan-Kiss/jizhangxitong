import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 4790);
const TOKEN = String(process.env.SERVICE_TOKEN || '').trim();
const COOKIES_PATH =
  process.env.COOKIES_PATH || '/www/wwwroot/jade-accounting/secrets/qianfan-cookies.json';

function loadCookies() {
  return JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
}

function canonical(name) {
  const label = String(name || '').trim();
  const rules = [
    { n: 'XY祥钰珠宝', p: [/XY\s*祥钰/i, /XY祥钰珠宝/i] },
    { n: '拾玉居和田玉', p: [/拾玉居/i] },
    { n: '和田雅玉', p: [/和田雅玉/i, /禾田雅玉/i] },
    { n: '祥钰珠宝', p: [/^祥钰珠宝$/i] },
  ];
  for (const r of rules) if (r.n === label) return r.n;
  for (const r of rules) if (r.p.some((x) => x.test(label))) return r.n;
  return label;
}

function authOk(req) {
  const h = String(req.headers.authorization || '');
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const x = String(req.headers['x-service-token'] || '').trim();
  return TOKEN && (bearer === TOKEN || x === TOKEN);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'qianfan-cookie-resolver' }));
    return;
  }
  if (url.pathname === '/api/secrets/resolve' && req.method === 'GET') {
    if (!authOk(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    const shop = canonical(url.searchParams.get('shopName') || '');
    const cookies = loadCookies();
    const row = cookies[shop];
    if (!row || !row.value) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        platform: 'qianfan',
        shopName: shop,
        keyName: 'cookie',
        value: row.value,
        updatedAt: row.updatedAt,
        source: 'manual-update',
      }),
    );
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[qianfan-cookie-resolver] listening', PORT);
});
