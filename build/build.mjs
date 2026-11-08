#!/usr/bin/env node
/* Assemble les deux versions de l'appli à partir de src/ et assets/ :
     app/                    version autonome (navigateur, PWA installable)
     dist/artifact/index.html version claude.ai (capacités fournies par la plateforme)
   Usage : node build/build.mjs   (aucune dépendance npm nécessaire) */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = (...p) => join(ROOT, 'assets', ...p);
const b64 = p => readFileSync(A(p)).toString('base64');

const template = readFileSync(join(ROOT, 'src', 'app.html'), 'utf8');
const core = readFileSync(join(ROOT, 'src', 'core.js'), 'utf8');
const adapter = readFileSync(join(ROOT, 'src', 'standalone.js'), 'utf8');

const CDN_JSPDF = [
  'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
const GOOGLE_FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">'
].join('\n');
const PWA_HEAD = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<meta name="theme-color" content="#0B3854">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="FAN\'APA">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<script>if (\'serviceWorker\' in navigator && /^https?:$/.test(location.protocol)) { window.addEventListener(\'load\', function () { navigator.serviceWorker.register(\'sw.js\').catch(function () {}); }); }</script>'
].join('\n');

function render({ fonts, head, adapterTag, jspdfUrls }) {
  let html = template;
  const must = (k, v) => {
    if (!html.includes(k)) throw new Error('Marqueur absent du gabarit : ' + k);
    html = html.split(k).join(v);
  };
  must('<!--FONTS-->', fonts);
  must('<!--HEAD_EXTRA-->', head);
  must('<!--ADAPTER-->', adapterTag);
  must('/*__CORE__*/', core);
  must('/*__JSPDF_URLS__*/', JSON.stringify(jspdfUrls));
  must('{{LOGO_PDF}}', 'data:image/jpeg;base64,' + b64('logo_pdf.jpg'));
  must('{{LOGO_FULL}}', 'data:image/webp;base64,' + b64('logo_full.webp'));
  must('{{LOGO_MARK}}', 'data:image/webp;base64,' + b64('logo_mark.webp'));
  must('{{FONT_400}}', b64('fonts/Montserrat-400.ttf'));
  must('{{FONT_600}}', b64('fonts/Montserrat-600.ttf'));
  must('{{FONT_700}}', b64('fonts/Montserrat-700.ttf'));
  const left = html.match(/\{\{[A-Z_0-9]+\}\}|\/\*__[A-Z_]+__\*\/|<!--(FONTS|HEAD_EXTRA|ADAPTER)-->/g);
  if (left) throw new Error('Marqueurs non remplacés : ' + left.join(', '));
  return html;
}
const kb = s => Math.round(Buffer.byteLength(s) / 1024) + ' Ko';

/* ---------- 1. Version claude.ai (artifact) ---------- */
const artifact = render({ fonts: GOOGLE_FONTS, head: '', adapterTag: '', jspdfUrls: CDN_JSPDF });
mkdirSync(join(ROOT, 'dist', 'artifact'), { recursive: true });
writeFileSync(join(ROOT, 'dist', 'artifact', 'index.html'), artifact);
console.log('dist/artifact/index.html', kb(artifact));

/* ---------- 2. Version autonome (app/) ---------- */
const APP = join(ROOT, 'app');
for (const d of ['vendor', 'fonts', 'icons']) {
  rmSync(join(APP, d), { recursive: true, force: true });
  mkdirSync(join(APP, d), { recursive: true });
}
copyFileSync(A('vendor', 'jspdf.umd.min.js'), join(APP, 'vendor', 'jspdf.umd.min.js'));
copyFileSync(A('vendor', 'LICENSE-jspdf.txt'), join(APP, 'vendor', 'LICENSE-jspdf.txt'));

const fontFiles = readdirSync(A('fonts', 'web')).filter(f => f.endsWith('.woff2')).sort();
let fontsCss = '/* Polices locales (OFL) : Montserrat pour les titres, Lexend pour le texte */\n';
for (const f of fontFiles) {
  copyFileSync(A('fonts', 'web', f), join(APP, 'fonts', f));
  const m = f.match(/^(montserrat|lexend)-latin-(\d{3})-normal\.woff2$/);
  if (!m) continue;
  const family = m[1] === 'montserrat' ? 'Montserrat' : 'Lexend';
  fontsCss += `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${m[2]}; font-display: swap; src: url(${f}) format('woff2'); }\n`;
}
writeFileSync(join(APP, 'fonts', 'fonts.css'), fontsCss);
for (const f of ['OFL-Montserrat.txt', 'OFL-Lexend.txt']) copyFileSync(A('fonts', f), join(APP, 'fonts', f));

const icons = readdirSync(A('icons')).filter(f => f.endsWith('.png')).sort();
for (const f of icons) copyFileSync(A('icons', f), join(APP, 'icons', f));
copyFileSync(join(ROOT, 'src', 'pwa', 'manifest.webmanifest'), join(APP, 'manifest.webmanifest'));

const standalone = render({
  fonts: '<link rel="stylesheet" href="fonts/fonts.css">',
  head: PWA_HEAD,
  adapterTag: '<script>\n' + adapter + '\n</script>',
  jspdfUrls: ['vendor/jspdf.umd.min.js'].concat(CDN_JSPDF)
});
writeFileSync(join(APP, 'index.html'), standalone);

const version = createHash('sha256').update(standalone).digest('hex').slice(0, 10);
const assets = ['./', './index.html', './manifest.webmanifest', './vendor/jspdf.umd.min.js', './fonts/fonts.css']
  .concat(fontFiles.map(f => './fonts/' + f), icons.map(f => './icons/' + f));
const sw = readFileSync(join(ROOT, 'src', 'pwa', 'sw.js'), 'utf8')
  .replace('/*__VERSION__*/', version)
  .replace('/*__ASSETS__*/', JSON.stringify(assets, null, 2));
writeFileSync(join(APP, 'sw.js'), sw);
console.log('app/index.html', kb(standalone), '· cache', version, '·', assets.length, 'fichiers hors ligne');
if (!existsSync(join(APP, 'vendor', 'jspdf.umd.min.js'))) throw new Error('jsPDF manquant');
