#!/usr/bin/env node
/* Petit serveur local pour tester la version autonome (et son installation PWA) :
   node build/serve.mjs  puis ouvrir http://localhost:5173
   Il applique app/_headers comme le fait Netlify (sécurité, cache du service worker),
   pour tester l'appli dans les mêmes conditions qu'une fois en ligne. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

/* Format Netlify : une ligne de chemin (« /* » = tout), puis des lignes indentées « Nom: valeur » */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { cur = { path: raw.trim(), headers: {} }; rules.push(cur); continue; }
    const m = raw.trim().match(/^([^:]+):\s*(.*)$/);
    if (cur && m) cur.headers[m[1].trim()] = m[2].trim();
  }
  return rules;
}
function matches(rule, path) {
  if (rule.endsWith('/*')) return path.startsWith(rule.slice(0, -1));
  return rule === path;
}
function headersFor(path) {
  const file = join(ROOT, '_headers');
  if (!existsSync(file)) return {};
  const out = {};
  for (const r of parseHeaders(readFileSync(file, 'utf8'))) if (matches(r.path, path)) Object.assign(out, r.headers);
  return out;
}

// opts.transform(chemin, contenu) : permet aux tests de simuler une nouvelle version publiée
export function serve(port = PORT, opts = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (p.includes('..')) { res.writeHead(400); return res.end(); }
      if (p === '_headers') throw new Error('privé'); // Netlify ne le sert pas non plus
      let file = join(ROOT, p || 'index.html');
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      let data = await readFile(file);
      if (typeof opts.transform === 'function') data = opts.transform(url.pathname, data) || data;
      res.writeHead(200, Object.assign({ 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, headersFor(url.pathname)));
      res.end(data);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    }
  });
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  serve().then(() => console.log(`Appli disponible sur http://localhost:${PORT}`));
}
