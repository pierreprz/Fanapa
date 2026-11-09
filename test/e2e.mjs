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

  // Ancien slogan par défaut « … & Autonomie », enregistré par une version précédente : remplacé une fois
  assert.equal((await store('config/settings')).tagline, 'Activité Physique Adaptée');
  const older = await store('config/settings');
  delete older.settingsVersion;
  older.tagline = 'Activité Physique Adaptée & Autonomie';
  await page.evaluate(([p, v]) => new Promise((res, rej) => {
    const rq = indexedDB.open('fanapa-factures', 1);
    rq.onsuccess = () => {
      const db = rq.result, tx = db.transaction('docs', 'readwrite');
      tx.objectStore('docs').put(v, p);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
  }), ['config/settings', older]);
  await page.reload();
  await ready(page);
  for (let i = 0; i < 50 && ((await store('config/settings')) || {}).settingsVersion !== 2; i++) await page.waitForTimeout(100);
  const fixed = await store('config/settings');
  assert.equal(fixed.tagline, 'Activité Physique Adaptée', 'slogan corrigé et enregistré');
  assert.equal(fixed.settingsVersion, 2);
  assert.equal(fixed.qualification, 'Enseignante en APA – STAPS', 'le reste de Ma structure est intact');
  await page.click('.tabs [data-go="structure"]');
  assert.equal(await page.inputValue('[data-s="tagline"]'), 'Activité Physique Adaptée');
  step('ancien slogan « … & Autonomie » remplacé une fois pour toutes, le reste de Ma structure intact');

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
  assert.ok(await page.$$eval('#mail-links a', as => as.length === 3 && as.every(a => a.dataset.locked && !a.getAttribute('href'))), 'messagerie verrouillée avant d’enregistrer le PDF');
  const pdf1 = await download('[data-act="send-pdf"]');
  assert.equal(pdf1.name, `Facture FA-${YEAR}-001 - FAN'APA.pdf`, 'nom de fichier lisible par le client');
  assert.ok(pdf1.size > 50000);
  await page.waitForSelector('#mail-links a[data-mailer]');
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
  await p3.waitForSelector('#mail-links a');
  const file3 = `Facture FA-${YEAR}-001 - FAN'APA.pdf`;
  // Plus de partage « facture jointe » sur iPhone : le mail tout prêt, PDF enregistré d'abord
  assert.equal(await p3.$('[data-act="share-mail"]'), null, 'pas de bouton « Gmail avec la facture jointe »');
  assert.ok(await p3.$$eval('#mail-links a', as => as.length === 3 && as.every(a => a.dataset.locked && !a.getAttribute('href'))), 'messagerie verrouillée avant d’enregistrer la facture');
  assert.match(await p3.textContent('#mail-links'), /Enregistre d’abord le PDF/);
  assert.equal(await p3.$$eval('#stp-send .btn.navy', els => els.map(b => b.dataset.act).join()), 'send-pdf', 'seul bouton principal : Enregistrer la facture');
  await p3.$eval('#mail-links a[data-locked="gmail"]', a => a.click()); // toucher Gmail trop tôt : on rappelle l'étape a
  await p3.waitForFunction(() => /Enregistre d’abord le PDF/.test(document.querySelector('#toast').textContent));
  await p3.waitForTimeout(400);
  await p3.screenshot({ path: join(OUT, '10-iphone-envoi.png') });
  await p3.$eval('#stp-send', el => el.scrollIntoView({ block: 'start' }));
  await p3.waitForTimeout(300);
  await p3.screenshot({ path: join(OUT, '10b-iphone-envoi-verrou.png') });
  // a. « Enregistrer la facture » : menu de partage avec le PDF seul, puis la messagerie se déverrouille
  await p3.click('#stp-pdf [data-act="send-pdf"]');
  await p3.waitForFunction(() => window.__shared.length === 1);
  let shared = (await p3.evaluate(() => window.__shared))[0];
  assert.equal(shared.files.length, 1);
  assert.equal(shared.files[0].name, file3);
  await p3.waitForSelector('#stp-pdf.done');
  await p3.waitForSelector('#mail-links a[data-mailer]');
  const iosLinks = await p3.$$eval('#mail-links a', as => as.map(a => ({ k: a.dataset.mailer, href: a.getAttribute('href'), text: a.textContent })));
  assert.deepEqual(iosLinks.map(l => l.k), ['gmail', 'mail', 'outlook'], 'Gmail en premier');
  assert.equal(iosLinks[0].text, 'Ouvrir Gmail');
  assert.ok(iosLinks[0].href.startsWith('googlegmail:///co?to=paul.durand%40exemple.fr&subject=Facture%20FA-'), 'appli Gmail : nouveau mail adressé au client');
  assert.match(iosLinks[0].href, /&body=Bonjour%20M\.%20Paul%20Durand%2C%0D%0A%0D%0AVeuillez/, 'message avec ses retours à la ligne');
  assert.ok(iosLinks[1].href.startsWith('mailto:paul.durand@exemple.fr?subject=Facture%20FA-'), 'Mail : adresse remplie');
  assert.ok(iosLinks[2].href.startsWith('ms-outlook://compose?to=paul.durand%40exemple.fr'), 'appli Outlook');
  const gBody = decodeURIComponent(iosLinks[0].href.split('&body=')[1]);
  assert.ok(gBody.endsWith('Camille EXEMPLE\r\nFAN’APA – Activité Physique Adaptée\r\n06 01 02 03 04'), 'signature sans « Autonomie »');
  assert.doesNotMatch(gBody, /Autonomie/);
  assert.match(await p3.textContent('#m-attach'), /dans Gmail, touche le trombone/);
  assert.ok((await p3.textContent('#m-attach')).includes(file3), 'le nom du PDF à joindre est indiqué');
  assert.equal(await p3.$$eval('#stp-send .btn.navy', els => els.map(b => b.dataset.mailer).join()), 'gmail', 'après l’enregistrement : « Ouvrir Gmail » devient le bouton principal');
  await p3.$eval('#stp-send', el => el.scrollIntoView({ block: 'start' }));
  await p3.waitForTimeout(300);
  await p3.screenshot({ path: join(OUT, '10c-iphone-envoi-pret.png') });
  // La messagerie choisie est retenue (le lien lui-même n'est pas suivi dans le test)
  await p3.evaluate(() => {
    const a = document.querySelector('#mail-links a[data-mailer="mail"]');
    a.addEventListener('click', e => e.preventDefault(), { once: true });
    a.click();
  });
  await p3.waitForSelector('#stp-mail.done');
  assert.match(await p3.textContent('#m-attach'), /dans Mail, touche le texte du message/);
  assert.equal(await p3.evaluate(() => window.__shared.length), 1, 'aucun autre partage : la facture se joint dans le mail');
  // Rouverte pendant la même session : facture déjà enregistrée, messagerie préférée en premier
  await p3.click('.sheet [data-act="close"]');
  await p3.click('.tabs [data-go="factures"]');
  await p3.click(`.row[data-n="FA-${YEAR}-001"]`);
  await p3.click('.sheet [data-act="send"]');
  await p3.waitForSelector('#mail-links a[data-mailer]');
  assert.deepEqual(await p3.$$eval('#mail-links a', as => as.map(a => a.dataset.mailer)), ['mail', 'gmail', 'outlook'], 'messagerie préférée en premier');
  assert.ok(await p3.$('#stp-pdf.done'), 'étape a déjà faite : rien à refaire');
  await p3.click('.sheet [data-act="close"]');
  step('iPhone : mail tout prêt seulement ; Gmail, Mail et Outlook verrouillés tant que la facture n’est pas enregistrée, puis appli Gmail remplie et trombone');

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

  /* ================= 5. Clients conservés d'une session à l'autre ================= */
  const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p5 = await ctx5.newPage();
  watch(p5, '[5]');
  const clientsOf = () => p5.evaluate(() => new Promise(res => {
    const rq = indexedDB.open('fanapa-factures', 1);
    rq.onsuccess = () => {
      const tx = rq.result.transaction('docs'), st = tx.objectStore('docs'), k = st.getAllKeys(), v = st.getAll();
      tx.oncomplete = () => res(k.result.map((key, i) => [String(key), v.result[i]]).filter(([key]) => key.startsWith('clients/')).map(([, val]) => val));
    };
  }));
  const names = async () => (await clientsOf()).map(c => c.name).sort();
  const until = async (cond) => { for (let i = 0; i < 50 && !(await cond()); i++) await p5.waitForTimeout(100); };
  await p5.goto(`${BASE}/index.html#clients`);
  await ready(p5);
  // Fiche « Nouveau client » refermée avec la croix, sans toucher « Enregistrer »
  await p5.click('[data-act="client-new"]');
  await p5.fill('[data-cf="name"]', 'Mme Claire Petit');
  await p5.fill('[data-cf="address.city"]', 'Dole');
  await p5.click('.sheet [data-act="close"]');
  // Client tapé dans une facture jamais validée : on quitte la facture
  await p5.click('.tabs [data-go="nouvelle"]');
  await p5.fill('[data-b="client.name"]', 'M. Hugo Bernard');
  await p5.click('.tabs [data-go="clients"]');
  await p5.waitForFunction(() => /Hugo Bernard/.test(document.querySelector('#clients-body').textContent));
  await p5.reload();
  await ready(p5);
  await p5.waitForFunction(() => /Claire Petit/.test(document.querySelector('#clients-body').textContent) && /Hugo Bernard/.test(document.querySelector('#clients-body').textContent));
  // La suite de la saisie met à jour la même fiche : pas de doublon
  await p5.click('.tabs [data-go="nouvelle"]');
  await p5.fill('[data-b="client.email"]', 'hugo@exemple.fr');
  await until(async () => (await clientsOf()).some(c => c.email === 'hugo@exemple.fr'));
  assert.deepEqual(await names(), ['M. Hugo Bernard', 'Mme Claire Petit']);
  // Décocher « Enregistrer dans mes clients » retire la fiche créée depuis la facture
  await p5.uncheck('[data-b="saveClient"]');
  await until(async () => !(await names()).includes('M. Hugo Bernard'));
  assert.deepEqual(await names(), ['Mme Claire Petit']);
  // Supprimer une fiche juste après l'avoir modifiée : aucun enregistrement en retard ne la fait revenir
  await p5.click('.tabs [data-go="clients"]');
  await p5.click('[data-act="client-edit"]');
  await p5.fill('[data-cf="email"]', 'claire@exemple.fr');
  await p5.click('.sheet [data-act="client-del"]');
  await p5.click('[data-act="client-del-ok"]');
  await p5.waitForTimeout(1500);
  assert.deepEqual(await names(), []);
  step('clients conservés : fiche refermée sans « Enregistrer », client d’une facture non validée (sans doublon), case décochée, suppression');

  /* ================= 6. Brouillons, validation définitive, numérotation imposée ================= */
  const ctx6 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', acceptDownloads: true });
  const p6 = await ctx6.newPage();
  watch(p6, '[6]');
  const store6 = storeOf(p6);
  const draftsIn = () => p6.evaluate(() => new Promise(res => {
    const rq = indexedDB.open('fanapa-factures', 1);
    rq.onsuccess = () => {
      const tx = rq.result.transaction('docs'), k = tx.objectStore('docs').getAllKeys();
      tx.oncomplete = () => res(k.result.map(String).filter(key => key.startsWith('drafts/')));
    };
  }));
  const until6 = async cond => { for (let i = 0; i < 50 && !(await cond()); i++) await p6.waitForTimeout(100); };
  await p6.goto(`${BASE}/index.html#structure`);
  await ready(p6);
  assert.ok(await p6.$('[data-s="numbering.start"]'), 'avant la première facture, la reprise d’un autre outil reste possible');
  await fillStructure(p6);
  // 1. Une facture incomplète (sans adresse client) se garde en brouillon, sans numéro
  await p6.click('.tabs [data-go="nouvelle"]');
  await p6.fill('[data-b="client.name"]', 'Mme Alice Roux');
  await p6.fill('.line [data-l="unit"]', '50');
  await blur(p6);
  await p6.click('#btn-validate');
  await p6.waitForSelector('.sheet [data-act="draft-save"]');
  assert.equal(await p6.$('[data-act="confirm-validate"]'), null, 'incomplète : pas de validation définitive');
  await p6.click('.sheet [data-act="draft-save"]');
  await p6.waitForSelector('#drafts-block .row[data-s="draft"]');
  await p6.waitForTimeout(400);
  await p6.screenshot({ path: join(OUT, '13-brouillons.png') });
  assert.equal((await draftsIn()).length, 1);
  await p6.click('.tabs [data-go="nouvelle"]');
  assert.equal(await ticket(p6), `FA-${YEAR}-001`, 'un brouillon ne prend pas de numéro');
  // 2. Une facture complète validée définitivement prend 001
  await newInvoice(p6, { name: 'M. Bruno Leroy', line1: '3 rue Pasteur', email: 'bruno@exemple.fr' });
  assert.ok(await store6(`invoices/FA-${YEAR}-001`));
  await p6.click('.sheet [data-act="close"]');
  // 3. Le brouillon survit à la réouverture, se reprend, se complète, prend 002 tout seul et quitte les brouillons
  await p6.reload();
  await ready(p6);
  await p6.click('.tabs [data-go="factures"]');
  await p6.click('#drafts-block .row[data-s="draft"]');
  await p6.click('.sheet [data-act="draft-resume"]');
  assert.equal(await p6.inputValue('[data-b="client.name"]'), 'Mme Alice Roux');
  await p6.fill('[data-b="client.address.line1"]', '9 rue Victor Hugo');
  await p6.fill('[data-b="client.address.zip"]', '25000');
  await p6.fill('[data-b="client.address.city"]', 'Besançon');
  await blur(p6);
  await p6.click('#btn-validate');
  await p6.waitForSelector('[data-act="confirm-validate"]');
  await p6.waitForTimeout(400);
  await p6.screenshot({ path: join(OUT, '12-enregistrer-la-facture.png') });
  await p6.click('[data-act="confirm-validate"]');
  await p6.waitForSelector('.success');
  assert.equal((await store6(`invoices/FA-${YEAR}-002`)).client.name, 'Mme Alice Roux', 'numéro suivant, attribué automatiquement');
  await until6(async () => (await draftsIn()).length === 0);
  assert.equal((await draftsIn()).length, 0, 'brouillon retiré après validation');
  await p6.click('.sheet [data-act="close"]');
  // 4. Une facture validée ne se modifie pas et ne se supprime pas : on l'annule par un avoir
  await p6.click('.tabs [data-go="factures"]');
  await p6.click(`.row[data-n="FA-${YEAR}-001"]`);
  assert.ok(await p6.$('.sheet [data-act="credit"]'), 'annulation par avoir proposée');
  assert.equal(await p6.$('.sheet [data-act="edit"], .sheet [data-act="delete"], .sheet [data-act="draft-resume"]'), null, 'ni modification ni suppression');
  await p6.click('.sheet [data-act="close"]');
  // 5. Numérotation verrouillée : plus de « Démarrer à » ni de préfixe (sinon on pourrait sauter de 002 à 010)
  await p6.click('.tabs [data-go="structure"]');
  assert.equal(await p6.$('[data-s="numbering.start"]'), null);
  assert.equal(await p6.$('[data-s="numbering.prefix"]'), null);
  assert.match(await p6.textContent('#numbering-card'), /Verrouillée/);
  assert.match(await p6.textContent('#next-prev'), new RegExp(`FA-${YEAR}-003`));
  // 6. « Nouvelle facture » met de côté la facture en cours ; un brouillon se supprime
  await p6.click('.tabs [data-go="nouvelle"]');
  await p6.fill('[data-b="client.name"]', 'Brouillon à jeter');
  await blur(p6);
  await p6.click('.tabs [data-go="factures"]');
  await p6.click('[data-act="new-invoice"]');
  // La facture en cours est d'abord rangée dans les brouillons, puis l'éditeur repart vierge
  await p6.waitForFunction(() => { const i = document.querySelector('[data-b="client.name"]'); return document.body.classList.contains('v-nouvelle') && i && i.value === ''; });
  await until6(async () => (await draftsIn()).length === 1);
  await p6.click('.tabs [data-go="factures"]');
  await p6.click('#drafts-block .row[data-s="draft"]');
  await p6.click('.sheet [data-act="draft-del"]');
  await p6.click('[data-act="draft-del-ok"]');
  await p6.waitForFunction(() => !document.querySelector('#drafts-block'));
  assert.equal((await draftsIn()).length, 0);
  await p6.click('.tabs [data-go="nouvelle"]');
  assert.equal(await ticket(p6), `FA-${YEAR}-003`, 'aucun trou : la suivante reste 003');
  step('brouillon sans numéro (même incomplet), validation définitive 001 puis 002 automatiques, facture validée non modifiable, numérotation verrouillée, brouillon supprimé sans trou');

  // 7. Envoi : le destinataire vient de la fiche client ; une adresse tapée à l'envoi y est gardée ; copie possible
  const cardOf = name => p6.evaluate(nm => new Promise(res => {
    const rq = indexedDB.open('fanapa-factures', 1);
    rq.onsuccess = () => {
      const tx = rq.result.transaction('docs'), st = tx.objectStore('docs'), k = st.getAllKeys(), v = st.getAll();
      tx.oncomplete = () => res(k.result.map((key, i) => [String(key), v.result[i]]).filter(([key, val]) => key.startsWith('clients/') && val.name === nm).map(([, val]) => val)[0] || null);
    };
  }), name);
  const openSendFor = async num => {
    await p6.click('.tabs [data-go="factures"]');
    await p6.click(`.row[data-n="${num}"]`);
    await p6.click('.sheet [data-act="send"]');
    await p6.waitForSelector('#m-to');
  };
  await openSendFor(`FA-${YEAR}-002`);                        // Mme Alice Roux : facture et fiche sans e-mail
  assert.equal(await p6.inputValue('#m-to'), '');
  assert.match(await p6.textContent('#m-to-help'), /elle y sera enregistrée/);
  await p6.fill('#m-to', 'alice@exemple.fr');
  await p6.press('#m-to', 'Tab');                              // en quittant le champ, l'adresse rejoint la fiche
  await until6(async () => ((await cardOf('Mme Alice Roux')) || {}).email === 'alice@exemple.fr');
  assert.equal((await cardOf('Mme Alice Roux')).email, 'alice@exemple.fr');
  await p6.click('.sheet [data-act="close"]');
  await openSendFor(`FA-${YEAR}-002`);
  assert.equal(await p6.inputValue('#m-to'), 'alice@exemple.fr', 'destinataire repris de la fiche client');
  assert.match(await p6.textContent('#m-to-help'), /fiche client/);
  await p6.click('[data-act="send-pdf"]');                       // la messagerie s'ouvre une fois le PDF enregistré
  await p6.waitForSelector('#mail-links a[data-mailer]');
  let hrefs = await p6.$$eval('#mail-links a', as => as.map(a => a.href));
  assert.ok(hrefs.some(h => h.startsWith('mailto:alice@exemple.fr')) && hrefs.some(h => /mail\.google\.com.*to=alice%40exemple\.fr/.test(h)));
  await p6.check('#m-cc');                                     // « Me mettre en copie »
  hrefs = await p6.$$eval('#mail-links a', as => as.map(a => a.href));
  assert.ok(hrefs.every(h => /cc=contact%40fanapa\.fr/.test(h)), 'copie à soi dans Mail, Gmail et Outlook');
  await p6.waitForTimeout(400);
  await p6.screenshot({ path: join(OUT, '14-envoi-destinataire.png') });
  await p6.click('.sheet [data-act="close"]');
  await openSendFor(`FA-${YEAR}-002`);
  assert.equal(await p6.isChecked('#m-cc'), true, 'choix « copie » mémorisé');
  await p6.click('.sheet [data-act="close"]');
  step('envoi : destinataire repris de la fiche client, adresse tapée à l’envoi gardée dans la fiche, « Me mettre en copie » mémorisé');

  /* ================= 7. Facture ou avoir depuis « Nouvelle » : bandeau, avoir partiel, plafond, solde ================= */
  const ctx7 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', acceptDownloads: true });
  const p7 = await ctx7.newPage();
  watch(p7, '[7]');
  const store7 = storeOf(p7);
  const t7 = async sel => (await p7.textContent(sel)).replace(/\s+/g, ' '); // espaces insécables des montants
  const until7 = async cond => { for (let i = 0; i < 50 && !(await cond()); i++) await p7.waitForTimeout(100); };
  await p7.goto(`${BASE}/index.html#factures`);
  await ready(p7);
  await fillStructure(p7);
  await newInvoice(p7, { name: 'Mme Léa Moreau', line1: '3 rue Pasteur', email: 'lea@exemple.fr', qty: 4 }); // 4 × 45 = 180 €
  await p7.click('.sheet [data-act="close"]');
  const FA1 = `FA-${YEAR}-001`, FA2 = `FA-${YEAR}-002`, AV1 = `AV-${YEAR}-001`, AV2 = `AV-${YEAR}-002`, AV3 = `AV-${YEAR}-003`;
  // Le choix Facture / Avoir change le bandeau et sa numérotation
  assert.equal(await p7.getAttribute('#kind-seg [data-v="invoice"]', 'aria-pressed'), 'true');
  assert.equal(await ticket(p7), FA2);
  assert.match(await t7('#tk-eyebrow'), /Nouvelle facture/);
  await p7.click('#kind-seg [data-v="credit"]');
  await p7.waitForFunction(() => document.querySelector('#ticket').classList.contains('credit'));
  assert.equal(await ticket(p7), AV1, 'série des avoirs');
  assert.match(await t7('#tk-eyebrow'), /Nouvel avoir/);
  assert.equal(await p7.getAttribute('#kind-seg [data-v="credit"]', 'aria-pressed'), 'true');
  await p7.evaluate(() => window.scrollTo(0, 0));
  await p7.waitForTimeout(400);
  await p7.screenshot({ path: join(OUT, '15a-nouvel-avoir.png') });
  // Avoir partiel : facture choisie, client et lignes repris ; une séance sur quatre
  await p7.selectOption('#cr-of', FA1);
  await p7.waitForSelector('.cr-client');
  assert.match(await t7('.cr-client'), /Mme Léa Moreau/);
  assert.equal(await p7.inputValue('.line [data-l="qty"]'), '4');
  await p7.fill('.line [data-l="qty"]', '1');
  await blur(p7);
  await p7.waitForFunction(() => document.querySelector('#tb-total').textContent.replace(/\s/g, ' ') === '−45,00 €');
  assert.match(await t7('#tb-mention'), new RegExp('Avoir partiel sur la facture ' + FA1));
  await p7.waitForTimeout(400);
  await p7.screenshot({ path: join(OUT, '15-avoir-partiel.png') });
  await p7.click('#btn-validate');
  await p7.waitForSelector('[data-act="confirm-validate"]');
  assert.match(await t7('.sheet'), new RegExp('avoir partiel sur la facture ' + FA1));
  await p7.click('[data-act="confirm-validate"]');
  await p7.waitForSelector('.success');
  assert.match(await t7('.success'), new RegExp('Avoir ' + AV1 + ' validé'));
  assert.match(await t7('.success'), /il reste 135,00 € à payer/);
  const av1 = await store7('invoices/' + AV1);
  assert.equal(av1.kind, 'credit');
  assert.equal(av1.totals.ttc, -4500);
  assert.deepEqual([av1.creditOf.number, av1.creditOf.full], [FA1, false]);
  assert.ok(!((await store7('invoices/' + FA1)).status || {}).cancelledBy, 'un avoir partiel n’annule pas la facture');
  await p7.click('.sheet [data-act="close"]');
  assert.equal(await ticket(p7), FA2, 'après un avoir, l’éditeur repart sur une facture');
  // La fiche de la facture montre l'avoir et le reste dû
  await p7.click('.tabs [data-go="factures"]');
  await p7.click(`.row[data-n="${FA1}"]`);
  assert.match(await t7('.sheet .timeline'), new RegExp('Avoir ' + AV1));
  assert.match(await t7('.sheet .timeline'), /Reste dû 135,00 €/);
  // Un avoir ne dépasse jamais ce qui reste : la facture est soldée par un 2e avoir de 135 €
  await p7.click('.sheet [data-act="credit"]');
  await p7.click('.sheet [data-act="credit-part"]');                // « fais un avoir partiel » : éditeur d'avoir, facture choisie
  await p7.waitForSelector('#cr-of');
  assert.equal(await p7.inputValue('#cr-of'), FA1);
  assert.equal(await p7.inputValue('.line [data-l="unit"]'), '135', 'proposé : le solde de la facture');
  await p7.fill('.line [data-l="unit"]', '150');
  await blur(p7);
  await p7.click('#btn-validate');
  await p7.waitForSelector('.checklist');
  assert.match(await t7('.sheet'), /Il manque quelques mentions/);
  assert.match(await t7('.checklist'), /Au plus 135,00 € sur la facture/);
  assert.equal(await p7.$('[data-act="confirm-validate"]'), null, 'validation impossible au-delà du reste');
  await p7.click('.sheet [data-act="close"]');
  await p7.click('[data-act="credit-all"]');                        // « Toute la facture » : le solde, 135 €
  await p7.waitForFunction(() => document.querySelector('#tb-total').textContent.replace(/\s/g, ' ') === '−135,00 €');
  await p7.click('#btn-validate');
  await p7.click('[data-act="confirm-validate"]');
  await p7.waitForSelector('.success');
  assert.match(await t7('.success'), new RegExp('La facture ' + FA1 + ' est annulée'));
  assert.equal((await store7('invoices/' + FA1)).status.cancelledBy, AV2);
  assert.equal((await store7('invoices/' + AV2)).creditOf.full, true);
  await p7.click('.sheet [data-act="close"]');
  // Paiement après un avoir partiel : seul le reste dû est encaissé (livre des recettes, Urssaf)
  await newInvoice(p7, { name: 'M. Hugo Petit', line1: '9 rue Victor Hugo', email: 'hugo@exemple.fr', qty: 2 }); // 90 €
  await p7.click('.sheet [data-act="close"]');
  await p7.click('#kind-seg [data-v="credit"]');
  await p7.selectOption('#cr-of', FA2);
  await p7.fill('.line [data-l="qty"]', '1');
  await blur(p7);
  await p7.click('#btn-validate');
  await p7.click('[data-act="confirm-validate"]');
  await p7.waitForSelector('.success');
  assert.equal((await store7('invoices/' + AV3)).totals.ttc, -4500);
  await p7.click('.sheet [data-act="close"]');
  await p7.click('.tabs [data-go="factures"]');
  await p7.click(`.row[data-n="${FA2}"]`);
  await p7.click('.sheet [data-act="pay"]');
  assert.match(await t7('.sheet-h'), /45,00 € \(après avoir\)/);
  await p7.click('[data-act="pay-ok"]');
  await until7(async () => ((await store7('invoices/' + FA2)).status || {}).paidAmount === 4500);
  assert.equal((await store7('invoices/' + FA2)).status.paidAmount, 4500, 'encaissé : 90 € − 45 € d’avoir');
  await p7.click('.sheet [data-act="close"]');
  assert.match(await t7('.recettes'), /45,00 €/);
  assert.doesNotMatch(await t7('.recettes'), /90,00 €/);
  step('Nouvelle : choix Facture / Avoir (bandeau et numérotation AV), avoir partiel, plafond au reste dû, solde qui annule la facture, encaissement après avoir');
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nParcours complet OK · captures dans test/out/e2e/');
