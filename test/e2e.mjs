/* Parcours complet de la version autonome dans un vrai navigateur (Playwright).
   Prérequis : npm install && npx playwright install chromium && npm run build
   Usage     : npm run test:e2e        (CHROME_PATH=/chemin/vers/chrome pour un Chrome existant)
   Captures d'écran et fichiers téléchargés : test/out/e2e/
   L'appli est servie avec les en-têtes de app/_headers, comme sur Netlify (CSP comprise) :
   toute violation de sécurité ou erreur JavaScript fait échouer le test. */
import { chromium, devices } from 'playwright';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { serve } from '../build/serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out', 'e2e');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const YEAR = new Date().getFullYear();
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

// swVersion > 0 : le serveur publie une « nouvelle version » de l'appli (sw.js différent)
let swVersion = 0;
const server = await serve(PORT, {
  transform: (p, data) => (p === '/sw.js' && swVersion ? Buffer.concat([data, Buffer.from('\n// version de test ' + swVersion + '\n')]) : null)
});
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
const step = m => console.log('  ✓ ' + m);

function watch(page, tag) {
  page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
  // Les ressources introuvables sont signalées avec leur adresse (voir « response » ci-dessous)
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
  // /favicon.ico : demandé par Chrome seulement sur une page sans icône (le fichier texte du test)
  page.on('response', r => { if (r.status() >= 400 && !/\/favicon\.ico$/.test(r.url())) errors.push(tag + ' HTTP ' + r.status() + ' ' + r.url()); });
}
const storeOf = page => path => page.evaluate(p => new Promise(res => {
  const rq = indexedDB.open('fanapa-factures', 1);
  rq.onsuccess = () => { const g = rq.result.transaction('docs').objectStore('docs').get(p); g.onsuccess = () => res(g.result || null); };
}), path);
const downloaderOf = page => async selector => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const file = join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), size: statSync(file).size, file };
};
const ticket = page => page.evaluate(() => document.querySelector('#tk-ser').textContent + document.querySelector('#tk-seq').textContent);
const ready = page => page.waitForFunction(() => document.querySelector('.sync').textContent.includes('Sur cet appareil'));
// Sur téléphone, les barres du bas se masquent pendant la saisie : on ferme le « clavier » avant de les toucher
async function blur(page) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.waitForFunction(() => !document.body.classList.contains('typing'));
}
async function fillStructure(page) {
  await blur(page);
  await page.click('.tabs [data-go="structure"]');
  const vals = {
    firstName: 'Camille', lastName: 'Exemple', qualification: 'Enseignante en APA', 'address.line1': '12 rue des Granges', 'address.zip': '25000',
    'address.city': 'Besançon', siret: '732 829 320 00074', email: 'contact@fanapa.fr', phone: '0601020304',
    iban: 'FR76 3000 6000 0112 3456 7890 189', 'insurance.insurer': 'MAIF', 'insurance.policy': '4385658M'
  };
  for (const [k, v] of Object.entries(vals)) await page.fill(`[data-s="${k}"]`, v);
  await page.fill('[data-cat="0"][data-k="unit"]', '45');
  await saved(page); // plus besoin du bouton « Enregistrer » : l'enregistrement est automatique
}
// Ma structure : attend que l'enregistrement automatique soit fait
const saved = page => page.waitForFunction(() => {
  const s = document.querySelector('#save-state');
  return s && s.textContent === '✓ Enregistré automatiquement';
});
async function newInvoice(page, c) {
  await blur(page);
  await page.click('.tabs [data-go="nouvelle"]');
  if (c.pro) await page.click('[data-act="ctype"][data-v="pro"]');
  await page.fill('[data-b="client.name"]', c.name);
  await page.fill('[data-b="client.address.line1"]', c.line1);
  await page.fill('[data-b="client.address.zip"]', '25000');
  await page.fill('[data-b="client.address.city"]', 'Besançon');
  await page.fill('[data-b="client.email"]', c.email);
  if (c.siren) await page.fill('[data-b="client.siren"]', c.siren);
  await page.fill('.line [data-l="qty"]', String(c.qty || 1));
  await page.fill('.line [data-l="unit"]', String(c.unit || 45));
  await blur(page);
  await page.click('#btn-validate');
  await page.click('[data-act="confirm-validate"]');
  await page.waitForSelector('.success');
}

try {
  /* ================= 1. Téléphone (largeur iPhone), parcours principal ================= */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, '[1]');
  const store = storeOf(page), download = downloaderOf(page);
  const shot = name => page.screenshot({ path: join(OUT, name + '.png') });

  const resp = await page.goto(`${BASE}/index.html#factures`);
  assert.match(resp.headers()['content-security-policy'] || '', /default-src 'self'/, 'en-têtes de sécurité servis');
  assert.equal(resp.headers()['x-content-type-options'], 'nosniff');
  await page.waitForSelector('.welcome');
  await ready(page);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  const swResp = await page.request.get(`${BASE}/sw.js`);
  assert.equal(swResp.headers()['cache-control'], 'no-cache');
  await shot('01-bienvenue');
  step('ouverture, stockage local prêt, service worker actif, en-têtes de sécurité (CSP) appliqués');

  await fillStructure(page);
  assert.equal((await store('config/settings')).siret, '73282932000074');
  await page.setInputFiles('#logo-file', join(ROOT, 'assets', 'logo_mark.png'));
  await page.waitForFunction(() => /Logo mis à jour/.test(document.querySelector('#toast').textContent));
  assert.match((await store('config/logo')).data, /^data:image\/jpeg;base64,/);
  step('Ma structure enregistrée automatiquement, logo personnalisé');

  // Le scénario signalé : on remplit Ma structure, on part faire une facture, on ferme, on revient
  await page.fill('[data-s="qualification"]', 'Enseignante en APA – STAPS');
  await page.click('.tabs [data-go="nouvelle"]');                 // quitter l'écran enregistre aussitôt
  for (let i = 0; i < 50 && !/STAPS/.test(((await store('config/settings')) || {}).qualification || ''); i++) await page.waitForTimeout(100);
  await page.reload();
  await ready(page);
  await page.click('.tabs [data-go="structure"]');
  assert.equal(await page.inputValue('[data-s="qualification"]'), 'Enseignante en APA – STAPS');
  assert.equal(await page.inputValue('[data-s="siret"]'), '73282932000074');
  // Sans quitter l'écran : enregistré après une courte pause
  await page.fill('[data-s="phone"]', '0611223344');
  await saved(page);
  await page.reload();
  await ready(page);
  await page.click('.tabs [data-go="structure"]');
  assert.equal(await page.inputValue('[data-s="phone"]'), '0611223344');
  // Une prestation ajoutée puis remplie après un enregistrement automatique n'est pas perdue
  const nCat = await page.$$eval('#cat-rows [data-k="label"]', els => els.length);
  await page.click('[data-act="cat-new"]');
  await page.waitForTimeout(1200);                                 // l'enregistrement passe pendant que la ligne est vide
  await page.fill(`[data-cat="${nCat}"][data-k="label"]`, 'Atelier équilibre');
  await page.fill(`[data-cat="${nCat}"][data-k="unit"]`, '30');
  await saved(page);
  assert.ok((await store('config/settings')).catalog.some(x => x.label === 'Atelier équilibre' && x.unit === 3000));
  step('Ma structure conservée sans toucher « Enregistrer » : en quittant l’écran, après une pause, à la réouverture');

  // Facture 1 (particulier)
  await page.click('.tabs [data-go="nouvelle"]');
  assert.equal(await ticket(page), `FA-${YEAR}-001`);
  await newInvoice(page, { name: 'Mme Jeanne Martin', line1: '4 avenue de la Paix', email: 'jeanne.martin@exemple.fr', qty: 4 });
  const inv1 = await store(`invoices/FA-${YEAR}-001`);
  assert.equal(inv1.totals.ttc, 18000);
  assert.equal(await ticket(page), `FA-${YEAR}-002`);
  await shot('02-validee');
  step(`facture FA-${YEAR}-001 validée, le numéro suivant passe à 002`);

  // Envoi : PDF + liens de messagerie
  await page.click('.sheet [data-act="send"]');
  const pdf1 = await download('[data-act="send-pdf"]');
  assert.match(pdf1.name, /^Facture_FA-\d{4}-001_.*\.pdf$/);
  assert.ok(pdf1.size > 50000);
  const links = await page.$$eval('#mail-links a', as => as.map(a => a.href));
  assert.ok(links[0].startsWith('https://mail.google.com/') && links[1].startsWith('mailto:jeanne.martin@exemple.fr'));
  await page.click('[data-act="mark-sent"]');
  await page.waitForTimeout(400);
  await shot('03-envoi');
  await page.click('.sheet [data-act="close"]');
  step('PDF téléchargé (' + pdf1.size + ' octets), e-mail pré-rempli');

  // Rappel de sauvegarde : une facture n'existe que sur cet appareil
  await page.click('.tabs [data-go="factures"]');
  await page.waitForSelector('#backup-notice');
  await page.waitForTimeout(400);
  await shot('04-rappel-sauvegarde');
  step('rappel de sauvegarde affiché tant que la facture n’est que sur l’appareil');

  // Persistance, puis ouverture hors connexion (service worker)
  await page.reload();
  await page.click('.tabs [data-go="nouvelle"]');
  await page.waitForFunction(() => /2$/.test(document.querySelector('#tk-seq').textContent));
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => /2$/.test(document.querySelector('#tk-seq').textContent));
  await page.waitForFunction(() => document.fonts && document.fonts.check('16px Lexend'));
  await ctx.setOffline(false);
  step('données conservées après rechargement, appli ouverte hors connexion');

  // Paiement, avoir, exports
  await page.click('.tabs [data-go="factures"]');
  await page.click(`.row[data-n="FA-${YEAR}-001"]`);
  await page.click('[data-act="pay"]');
  await page.click('[data-act="pay-ok"]');
  await page.waitForSelector('[data-act="pdf-paid"]');
  await download('[data-act="pdf-paid"]');
  await page.click('[data-act="credit"]');
  await page.click('[data-act="credit-ok"]');
  await page.waitForSelector('.success');
  assert.equal((await store(`invoices/AV-${YEAR}-001`)).creditOf.number, `FA-${YEAR}-001`);
  await page.click('.sheet [data-act="close"]');
  await download('#view-factures [data-act="csv-recettes"]');
  step('paiement, PDF acquitté, avoir, livre des recettes');

  // Facture 2 (professionnel), envoyée mais pas encore payée
  await newInvoice(page, { pro: true, name: 'Association Sport Santé', line1: '1 rue du Stade', email: 'compta@sport-sante.fr', siren: '732829320', qty: 2 });
  await page.click('.sheet [data-act="send"]');
  await page.click('[data-act="mark-sent"]');
  await page.click('.sheet [data-act="close"]');
  assert.ok((await store(`invoices/FA-${YEAR}-002`)).status.sentAt);
  step(`facture FA-${YEAR}-002 (client professionnel) validée et envoyée`);

  // Sauvegarde : le rappel disparaît
  await blur(page);
  await page.click('.tabs [data-go="structure"]');
  const backup = await download('#view-structure [data-act="backup"]');
  await page.waitForFunction(() => /Dernière sauvegarde le/.test(document.querySelector('#backup-card').textContent));
  await page.click('.tabs [data-go="factures"]');
  await page.waitForSelector('.kpis');
  assert.equal(await page.$('#backup-notice'), null, 'plus de rappel après la sauvegarde');
  await page.waitForTimeout(300);
  await shot('05-liste');
  step('sauvegarde exportée (' + Math.round(backup.size / 1024) + ' Ko, logo compris), le rappel disparaît');

  // Nouvelle version publiée : l'appli propose de recharger
  swVersion = 1;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await page.waitForSelector('#update-banner:not([hidden])', { timeout: 15000 });
  await shot('06-mise-a-jour');
  await Promise.all([page.waitForEvent('load'), page.click('[data-act="app-reload"]')]);
  await ready(page);
  assert.equal(await page.isHidden('#update-banner'), true);
  step('nouvelle version détectée, bandeau « Mettre à jour », rechargement sans perte');

  // Deux onglets ne peuvent pas obtenir le même verrou de numérotation
  const tab2 = await ctx.newPage();
  watch(tab2, '[1b]');
  await tab2.goto(`${BASE}/index.html#factures`);
  await ready(tab2);
  const lease = (pg, h) => pg.evaluate(h => window.claude.use('db').then(db => db.doc('tests/verrou').acquire({ holder: h, ttlMs: 20000 })).then(r => r.acquired), h);
  const [la, lb] = await Promise.all([lease(page, 'A'), lease(tab2, 'B')]);
  assert.ok(la !== lb, 'un seul onglet obtient le verrou');
  const [win, lose, loseH] = la ? [page, tab2, 'B'] : [tab2, page, 'A'];
  assert.equal(await lease(lose, loseH), false, 'verrou toujours tenu');
  await win.evaluate(() => window.claude.use('db').then(db => db.doc('tests/verrou').set({ ok: true })));
  assert.equal(await lease(lose, loseH), true, 'verrou libéré une fois le document écrit');
  await tab2.close();
  step('verrou de numérotation atomique entre deux onglets');

  /* ================= 2. Autre navigateur, 3 jours plus tard : import et relance ================= */
  const later = new Date(Date.now() + 3 * 86400000);
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR', acceptDownloads: true });
  await ctx2.clock.setFixedTime(later);
  const p2 = await ctx2.newPage();
  watch(p2, '[2]');
  const store2 = storeOf(p2);
  await p2.goto(`${BASE}/index.html#structure`);
  await p2.waitForSelector('#backup-file', { state: 'attached' });
  await p2.setInputFiles('#backup-file', backup.file);
  assert.equal(await p2.isChecked('#imp-settings'), true, 'navigateur vierge : Ma structure et le logo sont repris');
  await p2.click('[data-act="import-ok"]');
  await p2.waitForFunction(() => !document.querySelector('[data-act="import-ok"]'));
  assert.match((await store2('config/logo')).data, /^data:image\/jpeg;base64,/, 'logo restauré');
  assert.equal((await store2('config/settings')).siret, '73282932000074');
  assert.equal(await p2.inputValue('[data-s="lastName"]'), 'Exemple', 'le formulaire montre Ma structure importée');
  await p2.click('.tabs [data-go="nouvelle"]');
  const expected = later.getFullYear() === YEAR ? `FA-${YEAR}-003` : `FA-${later.getFullYear()}-001`;
  await p2.waitForFunction(n => document.querySelector('#tk-ser').textContent + document.querySelector('#tk-seq').textContent === n, expected);
  await p2.screenshot({ path: join(OUT, '07-bureau-apres-import.png') });
  step(`sauvegarde importée sur un autre navigateur (Ma structure et logo compris) : la numérotation reprend à ${expected}`);

  await p2.click('.tabs [data-go="factures"]');
  assert.equal(await p2.$('#backup-notice'), null, 'factures importées = déjà sauvegardées');
  await p2.waitForSelector(`.row[data-n="FA-${YEAR}-002"][data-s="late"]`);
  await p2.click(`.row[data-n="FA-${YEAR}-002"]`);
  await p2.click('.sheet [data-act="remind"]');
  const body = await p2.inputValue('#m-body');
  assert.match(body, /^Bonjour Association Sport Santé,/);
  assert.match(body, /reste à ce jour impayée/);
  assert.match(await p2.inputValue('#m-subject'), /^Relance : facture FA-\d{4}-002/);
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: join(OUT, '08-relance.png') });
  await p2.click('[data-act="mark-reminded"]');
  await p2.waitForFunction(() => /Relance notée/.test(document.querySelector('.sheet').textContent));
  const reminded = await store2(`invoices/FA-${YEAR}-002`);
  assert.equal(reminded.status.reminders, 1);
  assert.ok(reminded.status.sentAt, 'l’envoi initial est conservé');
  await p2.click('.sheet [data-act="close"]');
  await p2.waitForFunction(() => /relancée le/.test(document.querySelector('#list-body').textContent));
  await p2.click(`.row[data-n="FA-${YEAR}-002"]`);
  await p2.click('.sheet [data-act="remind"]');
  assert.match(await p2.inputValue('#m-subject'), /^2e relance : facture/);
  assert.match(await p2.inputValue('#m-body'), /indemnité forfaitaire pour frais de recouvrement de 40/);
  await p2.click('.sheet [data-act="close"]');
  step('facture échue : relance pré-remplie (vouvoiement), notée dans l’historique, 2e relance avec les pénalités pro');

  /* ================= 3. iPhone (Safari) : installation, date du brouillon, partage ================= */
  const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
  const ctx3 = await browser.newContext({ ...iphone, locale: 'fr-FR', acceptDownloads: true });
  await ctx3.addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async d => { window.__shared.push({ title: d.title || '', text: d.text || '', files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) }); }
    });
  });
  const p0 = await ctx3.newPage();
  watch(p0, '[3]');
  await p0.goto(`${BASE}/index.html#factures`);
  await ready(p0);
  await p0.waitForSelector('#install-notice');
  await p0.waitForTimeout(400);
  assert.match(await p0.textContent('#install-notice'), /Sur l’écran d’accueil/);
  assert.equal(await p0.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
  await p0.screenshot({ path: join(OUT, '09-iphone-installer.png') });
  step('iPhone : encart « Installe l’appli » avec les étapes Safari');

  // Brouillon commencé un autre jour : la date se remet à aujourd'hui, le reste est conservé
  await p0.click('.tabs [data-go="nouvelle"]');
  await p0.fill('[data-b="client.name"]', 'Brouillon d’un autre jour');
  await blur(p0);
  await p0.waitForFunction(() => /autre jour/.test(localStorage.getItem('fanapa.draft.v1') || ''));
  await p0.close();
  const p3 = await ctx3.newPage();
  watch(p3, '[3b]');
  await p3.goto(`${BASE}/fonts/OFL-Lexend.txt`); // même site, sans lancer l'appli
  await p3.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('fanapa.draft.v1'));
    d.issueDate = '2020-01-06'; d.service.date = '2020-01-06';
    localStorage.setItem('fanapa.draft.v1', JSON.stringify(d));
  });
  await p3.goto(`${BASE}/index.html#nouvelle`);
  await ready(p3);
  const today = await p3.evaluate(() => window.FanapaCore.todayISO());
  assert.equal(await p3.inputValue('[data-b="client.name"]'), 'Brouillon d’un autre jour');
  assert.equal(await p3.inputValue('[data-b="issueDate"]'), today);
  assert.equal(await p3.inputValue('[data-b="service.date"]'), today);
  // Pendant la saisie, les barres du bas laissent la place au clavier
  await p3.focus('[data-b="client.name"]');
  await p3.waitForFunction(() => document.body.classList.contains('typing'));
  assert.equal(await p3.isHidden('.tabs'), true);
  await blur(p3);
  assert.equal(await p3.isVisible('.tabs'), true);
  step('brouillon d’un autre jour remis à la date du jour, barres masquées pendant la saisie');

  await fillStructure(p3);
  await newInvoice(p3, { name: 'M. Paul Durand', line1: '8 rue Battant', email: 'paul.durand@exemple.fr', qty: 1 });
  await p3.click('.sheet [data-act="send"]');
  await p3.waitForSelector('[data-act="share-mail"]');
  await p3.waitForTimeout(400);
  await p3.screenshot({ path: join(OUT, '10-iphone-envoi.png') });
  await p3.click('[data-act="share-mail"]');
  await p3.waitForFunction(() => window.__shared.length === 1);
  const shared = (await p3.evaluate(() => window.__shared))[0];
  assert.equal(shared.files.length, 1);
  assert.match(shared.files[0].name, /^Facture_FA-\d{4}-001_M-Paul-Durand\.pdf$/);
  assert.equal(shared.files[0].type, 'application/pdf');
  assert.ok(shared.files[0].size > 50000);
  assert.match(shared.text, /^Bonjour M\. Paul Durand,/);
  assert.match(shared.title, /^Facture FA-\d{4}-001/);
  step('iPhone : « Partager la facture » ouvre le partage avec le PDF joint, l’objet et le message');

  /* ================= 4. iPhone, appli installée encore vide : récupérer ce qui a été saisi dans Safari ================= */
  const ctx4 = await browser.newContext({ ...iphone, locale: 'fr-FR' });
  await ctx4.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); });
  const p4 = await ctx4.newPage();
  watch(p4, '[4]');
  await p4.goto(`${BASE}/index.html#factures`);
  await ready(p4);
  await p4.waitForSelector('#transfer-notice');
  assert.equal(await p4.$('#install-notice'), null, 'appli installée : pas d’encart d’installation');
  await p4.waitForTimeout(400);
  await p4.screenshot({ path: join(OUT, '11-iphone-appli-vide.png') });
  await p4.setInputFiles('#transfer-notice [data-import="backup"]', backup.file);
  await p4.click('[data-act="import-ok"]');
  await p4.waitForSelector('.kpis');
  assert.equal(await p4.$('#transfer-notice'), null, 'encart retiré une fois les données là');
  assert.equal((await storeOf(p4)('config/settings')).lastName, 'Exemple');
  step('iPhone, appli installée vide : encart « Tu avais déjà commencé dans Safari ? », import en un geste');
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nParcours complet OK · captures dans test/out/e2e/');
