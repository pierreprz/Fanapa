/* Parcours complet de la version autonome dans un vrai navigateur (Playwright).
   Prérequis : npm install && npx playwright install chromium && npm run build
   Usage     : npm run test:e2e        (CHROME_PATH=/chemin/vers/chrome pour un Chrome existant)
   Captures d'écran et fichiers téléchargés : test/out/e2e/ */
import { chromium } from 'playwright';
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

const server = await serve(PORT);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];
const step = m => console.log('  ✓ ' + m);

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = name => page.screenshot({ path: join(OUT, name + '.png') });
  const store = path => page.evaluate(p => new Promise(res => {
    const rq = indexedDB.open('fanapa-factures', 1);
    rq.onsuccess = () => { const g = rq.result.transaction('docs').objectStore('docs').get(p); g.onsuccess = () => res(g.result || null); };
  }), path);
  const download = async (selector) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
    const file = join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), size: statSync(file).size };
  };

  await page.goto(`http://localhost:${PORT}/index.html#factures`);
  await page.waitForSelector('.welcome');
  await page.waitForFunction(() => document.querySelector('.sync').textContent.includes('Sur cet appareil'));
  await shot('01-bienvenue');
  step('ouverture, stockage local prêt');

  // Ma structure
  await page.click('.tabs [data-go="structure"]');
  const vals = {
    firstName: 'Camille', lastName: 'Exemple', qualification: 'Enseignante en APA', 'address.line1': '12 rue des Granges', 'address.zip': '25000',
    'address.city': 'Besançon', siret: '732 829 320 00074', email: 'contact@fanapa.fr', phone: '0601020304',
    iban: 'FR76 3000 6000 0112 3456 7890 189', 'insurance.insurer': 'MAIF', 'insurance.policy': '4385658M'
  };
  for (const [k, v] of Object.entries(vals)) await page.fill(`[data-s="${k}"]`, v);
  await page.fill('[data-cat="0"][data-k="unit"]', '45');
  await page.click('[data-act="settings-save"]');
  await page.waitForTimeout(300);
  assert.equal((await store('config/settings')).siret, '73282932000074');
  step('Ma structure enregistrée');

  // Facture 1
  await page.click('.tabs [data-go="nouvelle"]');
  await page.fill('[data-b="client.name"]', 'Mme Jeanne Martin');
  await page.fill('[data-b="client.address.line1"]', '4 avenue de la Paix');
  await page.fill('[data-b="client.address.zip"]', '25000');
  await page.fill('[data-b="client.address.city"]', 'Besançon');
  await page.fill('[data-b="client.email"]', 'jeanne.martin@exemple.fr');
  await page.fill('.line [data-l="qty"]', '4');
  assert.equal(await page.textContent('#tk-ser') + await page.textContent('#tk-seq'), `FA-${YEAR}-001`);
  await page.click('#btn-validate');
  await page.click('[data-act="confirm-validate"]');
  await page.waitForSelector('.success');
  const inv1 = await store(`invoices/FA-${YEAR}-001`);
  assert.equal(inv1.totals.ttc, 18000);
  assert.equal(await page.textContent('#tk-ser') + await page.textContent('#tk-seq'), `FA-${YEAR}-002`);
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
  await shot('03-envoi');
  await page.click('.sheet [data-act="close"]');
  step('PDF téléchargé (' + pdf1.size + ' octets), e-mail pré-rempli');

  // Persistance après rechargement
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#tk-seq') && /2$/.test(document.querySelector('#tk-seq').textContent));
  step('données conservées après rechargement');

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
  await download('[data-act="csv-recettes"]');
  const backup = await (async () => { await page.click('.tabs [data-go="structure"]'); return download('[data-act="backup"]'); })();
  await page.click('.tabs [data-go="factures"]');
  await page.waitForTimeout(300);
  await shot('04-liste');
  step('paiement, PDF acquitté, avoir, livre des recettes, sauvegarde (' + backup.size + ' octets)');

  // Import de la sauvegarde dans un navigateur vierge
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR', acceptDownloads: true });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push('pageerror (2): ' + e.message));
  await p2.goto(`http://localhost:${PORT}/index.html#structure`);
  await p2.waitForSelector('#backup-file', { state: 'attached' });
  await p2.setInputFiles('#backup-file', join(OUT, backup.name));
  await p2.click('[data-act="import-ok"]');
  await p2.waitForTimeout(500);
  await p2.click('.tabs [data-go="nouvelle"]');
  await p2.waitForFunction(() => /2$/.test(document.querySelector('#tk-seq').textContent));
  await p2.screenshot({ path: join(OUT, '05-bureau-apres-import.png') });
  step('sauvegarde importée sur un autre navigateur : la numérotation reprend à 002');
} finally {
  await browser.close();
  server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('\nParcours complet OK · captures dans test/out/e2e/');
