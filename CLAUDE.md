# CLAUDE.md — Factures FAN'APA

## Contexte
Appli de facturation de FAN'APA, micro-entreprise française d'activité physique adaptée
(entrepreneur individuel, franchise en base de TVA, art. 293 B du CGI). Utilisatrice non
technique, surtout sur téléphone. Interface en français avec tutoiement ; tout ce que voit le
client final (PDF, e-mails) est au vouvoiement.

## Commandes
- `npm run build` : régénère `app/` (version autonome) et `dist/artifact/index.html` (claude.ai).
  Ne jamais éditer `app/` ni `dist/` à la main : modifier `src/` ou `assets/`, puis rebuild.
- `npm test` : tests unitaires de `src/core.js` et génération de PDF d'exemple.
- `npm run test:e2e` : parcours complet Playwright sur `app/` (lancer après tout changement
  d'interface ; `CHROME_PATH` pour utiliser un Chrome déjà installé).
- `npm start` : serveur local http://localhost:5173.

## Architecture
- `src/app.html` : gabarit unique, CSS et JS vanilla, aucune étape de compilation.
  Marqueurs remplacés par `build/build.mjs` : `<!--FONTS-->`, `<!--HEAD_EXTRA-->`,
  `<!--ADAPTER-->`, `/*__CORE__*/`, `/*__JSPDF_URLS__*/`, `{{LOGO_*}}`, `{{FONT_*}}`.
- `src/core.js` : logique pure sans DOM (formats, contrôles SIRET/SIREN/IBAN, numérotation,
  mentions, totaux, PDF jsPDF, CSV), exposée sous `window.FanapaCore` et testée en Node.
- Données, téléchargements et droits passent uniquement par
  `window.claude.use('db' | 'downloads' | 'user')`, le contrat de la plateforme claude.ai.
  `src/standalone.js` l'implémente hors claude.ai (IndexedDB + BroadcastChannel,
  téléchargement ou partage natif sur mobile). Pour un serveur : écrire un autre adaptateur
  avec la même interface (`doc`/`collection`, `get`/`set`/`update`/`delete`, `onSnapshot`,
  `acquire`) sans toucher à l'interface.
- Chemins : `config/settings`, `config/logo`, `clients/<id>`, `invoices/<numéro>`
  (l'identifiant du document est le numéro de facture).
- PDF : jsPDF 4.2.1, Montserrat embarquée en base64, PDF chiffré (impression et copie
  autorisées, modification interdite). L'aperçu HTML (`paperHTML`) reproduit le PDF
  (`buildInvoicePDF`) : toute évolution de mise en page se fait dans les deux.

## Invariants (obligations légales : ne jamais casser)
1. Numérotation chronologique et continue, sans trou ni doublon : `PREFIXE-AAAA-NNN`, série
   annuelle. Numéro attribué seulement à la validation par `claimNumber()`
   (acquire → get → set). Aucune suppression de facture.
2. Facture validée immuable : seul `status` évolue (`sentAt`, `paidAt`, `paidMethod`,
   `cancelledBy`). Corriger = avoir (`kind: 'credit'`, série AV, `creditOf`).
3. Chaque facture stocke un instantané de tout ce qu'elle affiche (`seller`, `client`,
   `vat`, `terms`, `insurance`, `totals`) : ne jamais réafficher une facture passée à partir
   des réglages courants.
4. `checks()` vérifie avant validation : nom + « EI », adresse, SIRET, client (nom, adresse,
   SIREN si professionnel), dates d'émission et de prestation, désignation / quantité /
   PU HT, totaux, mention TVA, échéance, pénalités + indemnité de 40 € + escompte pour les
   professionnels, assurance RC pro, catégorie d'opération. Le numéro figure sur chaque page.
5. Montants en centimes entiers ; affichage avec `fmtMoney` (format français).
6. Toute donnée affichée passe par `esc()`, y compris celle qui vient du stockage.

## Style
- Couleurs dans les tokens `:root` : marine #0B3854, sarcelle #1A96A0, vert feuille #7AB648.
  Polices : Montserrat (titres, chiffres), Lexend (texte).
- Mobile d'abord : champs à 16 px minimum (pas de zoom sur iOS), barre d'onglets en bas.
  Bureau (≥ 960 px) : barre latérale, formulaire à gauche, aperçu A4 à droite.

## À savoir
- À partir du 1er septembre 2027, les micro-entreprises devront émettre leurs factures B2B en
  électronique via une plateforme agréée : prévoir un export Factur-X / UBL ou une intégration.
- Version autonome : données dans le navigateur, d'où l'export / import de sauvegarde JSON
  (Ma structure → Sauvegarde). Ne pas retirer cette fonction tant qu'il n'y a pas de serveur.
