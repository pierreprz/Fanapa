/* Tests du cœur métier (formats, contrôles, numérotation, e-mail) et du PDF.
   Usage : npm test   → génère aussi des PDF d'exemple dans test/out/ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { parseHeaders } from '../build/serve.mjs';

const require = createRequire(import.meta.url);
const { jsPDF } = require('jspdf');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
await import('../src/core.js');
const K = globalThis.FanapaCore;

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }
const sp = s => s.replace(/ /g, ' ');

console.log('Formats et contrôles');
test('montants en euros à la française', () => {
  assert.equal(sp(K.fmtMoney(123456)), '1 234,56 €');
  assert.equal(sp(K.fmtMoney(-1000)), '−10,00 €');
  assert.equal(K.eurosToCents('45,5'), 4550);
  assert.equal(K.eurosToCents('1 200,00 €'), 120000);
  assert.equal(K.centsToInput(4500), '45');
});
test('dates', () => {
  assert.equal(K.fmtDate('2026-11-08'), '08/11/2026');
  assert.equal(K.fmtDateLong('2026-11-01'), '1er novembre 2026');
  assert.equal(K.addDays('2026-11-08', 30), '2026-12-08');
});
test('SIRET, SIREN et IBAN', () => {
  assert.ok(K.validSiret('732 829 320 00074'));
  assert.ok(!K.validSiret('73282932000075'));
  assert.ok(K.validSiren('732829320'));
  assert.ok(K.validIban('FR76 3000 6000 0112 3456 7890 189'));
  assert.ok(!K.validIban('FR7630006000011234567890188'));
});

console.log('Numérotation');
const invs = [{ series: 'FA-2026', seq: 1 }, { series: 'FA-2026', seq: 2 }, { series: 'FA-2025', seq: 40 }];
test('séquence continue par année', () => {
  assert.equal(K.nextSeq(invs, 'invoice', { prefix: 'FA', yearly: true }, 2026).number, 'FA-2026-003');
  assert.equal(K.nextSeq([], 'invoice', { prefix: 'FA', yearly: true }, 2026).number, 'FA-2026-001');
  assert.equal(K.nextSeq(invs, 'invoice', { prefix: 'FA', yearly: true }, 2027).number, 'FA-2027-001');
});
test('numéro de départ (factures déjà émises ailleurs)', () => {
  assert.equal(K.nextSeq([], 'invoice', { prefix: 'FA', yearly: true, start: 6, startYear: 2026 }, 2026).number, 'FA-2026-006');
  assert.equal(K.nextSeq(invs, 'invoice', { prefix: 'FA', yearly: true, start: 6, startYear: 2026 }, 2027).number, 'FA-2027-001');
});
test('avoirs dans leur propre série', () => {
  assert.equal(K.nextSeq(invs, 'credit', { prefix: 'FA', creditPrefix: 'AV', yearly: true }, 2026).number, 'AV-2026-001');
});
test('préfixe nettoyé', () => { assert.equal(K.cleanPrefix('f a/26', 'FA'), 'FA26'); });

console.log('Totaux et mentions');
const seller = {
  firstName: 'Camille', lastName: 'Exemple', tradeName: "FAN'APA", tagline: 'Activité Physique Adaptée & Autonomie',
  qualification: 'Enseignante en APA – licence STAPS APA-S',
  address: { line1: '12 rue des Granges', line2: '', zip: '25000', city: 'Besançon' },
  siret: '73282932000074', email: 'contact@fanapa.fr', phone: '0601020304',
  iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP', insurance: { insurer: 'MAIF', policy: '4385658M', coverage: 'France' }
};
const base = {
  kind: 'invoice', number: 'FA-2026-001', series: 'FA-2026', seq: 1, issueDate: '2026-11-08',
  service: { mode: 'period', from: '2026-11-01', to: '2026-11-30' }, term: 'reception', dueDate: '2026-11-08',
  client: { type: 'particulier', name: 'Mme Jeanne Martin', address: { line1: '4 avenue de la Paix', line2: 'Bât. B', zip: '25000', city: 'Besançon' }, email: 'jeanne.martin@exemple.fr' },
  lines: [
    { label: 'Séance individuelle d’activité physique adaptée (1 h)', detail: 'Séances des 3, 10, 17 et 24 novembre 2026', qty: 4, unit: 4500 },
    { label: 'Bilan de la condition physique', qty: 1, unit: 6000 },
    { label: 'Remise fidélité', qty: 1, unit: -1000 }
  ],
  vat: { mode: 'franchise' }, methods: ['virement', 'cheque', 'especes'], seller, insurance: seller.insurance,
  terms: { penaltyRate: K.DEFAULT_PENALTY }, notes: 'Facture utilisable pour votre mutuelle.', thanks: 'Merci pour votre confiance !'
};
base.totals = K.computeTotals(base.lines, base.vat, 1);
test('totaux en franchise de TVA', () => {
  assert.deepEqual(base.totals, { ht: 23000, tva: 0, ttc: 23000 });
  assert.equal(K.vatMention(base.vat), 'TVA non applicable, art. 293 B du CGI');
});
test('totaux avec TVA', () => {
  assert.deepEqual(K.computeTotals(base.lines, { mode: 'subject', rate: 20 }, 1), { ht: 23000, tva: 4600, ttc: 27600 });
});
test('mention EI et pénalités pro', () => {
  assert.equal(K.sellerName(seller), 'Camille EXEMPLE EI');
  assert.match(K.proLateText({}), /40.€/);
});
test('e-mail pré-rempli', () => {
  const m = K.buildMail(base, { mail: {} });
  assert.equal(m.subject, "Facture FA-2026-001 – FAN'APA");
  assert.match(m.body, /^Bonjour Mme Jeanne Martin,/);
  assert.match(m.body, /230,00 €/);
  assert.match(m.body, /IBAN : FR76 3000/);
});
test('relance courtoise ; pénalités rappelées aux professionnels à partir de la 2e', () => {
  const r1 = K.buildReminderMail(base, { mail: {} }, 1);
  assert.equal(r1.subject, "Relance : facture FA-2026-001 – FAN'APA");
  assert.match(r1.body, /^Bonjour Mme Jeanne Martin,/);
  assert.match(r1.body, /Sauf erreur de ma part, la facture n° FA-2026-001 du 08\/11\/2026, d’un montant de 230,00 €, payable à réception, reste à ce jour impayée\./);
  assert.match(r1.body, /IBAN : FR76 3000/);
  assert.doesNotMatch(r1.body, /40 €/);
  const pro = Object.assign({}, base, { term: '30', dueDate: '2026-12-08', client: { type: 'pro', name: 'Association Sport Santé', contact: 'M. Paul Durand' } });
  const r2 = K.buildReminderMail(pro, { mail: {} }, 2);
  assert.equal(r2.subject, "2e relance : facture FA-2026-001 – FAN'APA");
  assert.match(r2.body, /^Bonjour M\. Paul Durand,/);
  assert.match(r2.body, /arrivée à échéance le 08\/12\/2026/);
  assert.match(r2.body, /indemnité forfaitaire pour frais de recouvrement de 40 €/);
  assert.equal(K.reminderLabel(3), '3e relance');
});
test('CSV sans formule involontaire', () => {
  const csv = K.toCSV([['=SOMME(A1)', '-240,00', 'a;b']]);
  assert.ok(csv.includes("'=SOMME(A1)") && csv.includes(';-240,00;') && csv.includes('"a;b"'));
});

console.log('Mise en ligne (Netlify, appli installable)');
test('en-têtes : politique de sécurité et service worker toujours revérifié', () => {
  const rules = parseHeaders(readFileSync(join(ROOT, 'src', 'pwa', '_headers'), 'utf8'));
  const all = rules.find(r => r.path === '/*').headers;
  assert.match(all['Content-Security-Policy'], /default-src 'self'/);
  assert.match(all['Content-Security-Policy'], /connect-src 'self'/);
  assert.match(all['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(all['X-Content-Type-Options'], 'nosniff');
  assert.equal(rules.find(r => r.path === '/sw.js').headers['Cache-Control'], 'no-cache');
});
test('manifeste : appli autonome, icônes présentes, raccourci « Nouvelle facture »', () => {
  const man = JSON.parse(readFileSync(join(ROOT, 'src', 'pwa', 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.start_url, './');
  assert.equal(man.display, 'standalone');
  assert.ok(man.icons.some(i => i.purpose === 'maskable'));
  man.icons.forEach(i => assert.ok(existsSync(join(ROOT, 'assets', i.src)), i.src));
  assert.equal(man.shortcuts[0].url, './#nouvelle');
});
test('netlify.toml publie le dossier app/', () => {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /^\s*publish\s*=\s*"app"/m);
  assert.match(toml, /^\s*command\s*=\s*"node build\/build\.mjs"/m);
});

console.log('PDF');
const A = p => join(ROOT, 'assets', p);
const assets = {
  fonts: { 400: readFileSync(A('fonts/Montserrat-400.ttf')).toString('base64'), 600: readFileSync(A('fonts/Montserrat-600.ttf')).toString('base64'), 700: readFileSync(A('fonts/Montserrat-700.ttf')).toString('base64') },
  logo: { data: 'data:image/jpeg;base64,' + readFileSync(A('logo_pdf.jpg')).toString('base64'), w: 720, h: 519, format: 'JPEG' }
};
const out = join(ROOT, 'test', 'out');
mkdirSync(out, { recursive: true });
function pdf(name, inv, opts) {
  const buf = Buffer.from(K.buildInvoicePDF(jsPDF, inv, assets, opts).output('arraybuffer'));
  writeFileSync(join(out, name), buf);
  return buf;
}
test('facture particulier, PDF protégé', () => {
  const buf = pdf('facture-particulier.pdf', base);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.includes('/Encrypt'), 'PDF chiffré (modification interdite)');
});
test('facture pro sur plusieurs pages, acquittée', () => {
  const pro = JSON.parse(JSON.stringify(base));
  Object.assign(pro, { number: 'FA-2026-002', seq: 2, term: '30', dueDate: '2026-12-08', status: { paidAt: '2026-11-20', paidMethod: 'virement' } });
  pro.client = { type: 'pro', name: 'Association Sport Santé', contact: 'M. Paul Durand', siren: '732829320', address: { line1: '1 rue du Stade', zip: '25000', city: 'Besançon' } };
  pro.lines = Array.from({ length: 26 }, (_, i) => ({ label: 'Cours collectif d’APA', detail: 'Samedi ' + (i + 1), qty: 1, unit: 8000 }));
  pro.totals = K.computeTotals(pro.lines, pro.vat, 1);
  const buf = pdf('facture-pro-acquittee.pdf', pro, { paid: true });
  assert.ok((buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2, 'pagination');
});
test('avoir', () => {
  const cr = JSON.parse(JSON.stringify(base));
  Object.assign(cr, { kind: 'credit', number: 'AV-2026-001', series: 'AV-2026', creditOf: { number: 'FA-2026-001', date: '2026-11-08' } });
  cr.totals = K.computeTotals(cr.lines, cr.vat, -1);
  assert.equal(cr.totals.ttc, -23000);
  pdf('avoir.pdf', cr);
});
console.log(`\n${passed} tests OK · PDF d'exemple dans test/out/`);
