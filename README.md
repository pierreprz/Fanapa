# Factures FAN'APA

Appli de facturation pour FAN'APA, micro-entreprise d'activité physique adaptée :

- factures conformes (toutes les mentions obligatoires sont vérifiées avant validation) ;
- numérotation automatique et continue : FA-2026-001, puis 002, etc. ;
- PDF avec le logo, protégé contre la modification ;
- e-mail au client pré-rempli (Gmail, Mail, Outlook) ;
- suivi des paiements, avoirs, PDF « facture acquittée » pour les mutuelles ;
- livre des recettes et registre des factures en CSV, encaissements par trimestre pour l'Urssaf.

## Utiliser tout de suite

1. Ouvre `app/index.html` dans Chrome, Safari ou Firefox : l'appli fonctionne directement.
2. Pour l'installer sur un téléphone comme une vraie appli, mets le dossier `app/` en ligne
   (par exemple en le glissant sur Netlify Drop), ouvre l'adresse sur le téléphone, puis
   « Ajouter à l'écran d'accueil ». Elle marche ensuite aussi hors connexion.

> **Important :** cette version enregistre les données **dans le navigateur de l'appareil**.
> Exporte une sauvegarde régulièrement (Ma structure → Sauvegarde) : les factures sont à
> conserver 10 ans. Pour retrouver les factures sur plusieurs appareils, il faut un serveur
> (voir « Idées » plus bas).

## Développer

```bash
npm install                  # jsPDF (tests) et Playwright
npm run build                # régénère app/ et dist/artifact/
npm test                     # tests du cœur métier + PDF d'exemple dans test/out/
npx playwright install chromium
npm run test:e2e             # parcours complet dans un vrai navigateur
npm start                    # http://localhost:5173
```

Ne modifie jamais `app/index.html` à la main : change `src/`, puis `npm run build`.

## Organisation

```
src/app.html        interface (HTML/CSS/JS sans framework) avec ses marqueurs de build
src/core.js         cœur métier : formats, contrôles, numérotation, mentions, PDF, CSV
src/standalone.js   adaptateur hors claude.ai : stockage IndexedDB, téléchargement / partage
src/pwa/            manifest et service worker de la version installable
assets/             logo, polices (Montserrat, Lexend), jsPDF, icônes
build/build.mjs     assemble app/ (version autonome) et dist/artifact/ (version claude.ai)
build/serve.mjs     petit serveur local
test/               tests unitaires (npm test) et parcours complet (npm run test:e2e)
app/                version prête à l'emploi (générée)
```

## Comment ça marche

L'interface n'accède aux données qu'à travers `window.claude.use('db' | 'downloads' | 'user')`.
Dans claude.ai, c'est la plateforme qui fournit ces fonctions ; ailleurs, `src/standalone.js`
les fournit avec le stockage du navigateur. Pour synchroniser plusieurs appareils, il suffit
d'écrire un autre adaptateur (Supabase, Firebase…) avec la même interface : `doc()` /
`collection()`, `get`, `set`, `update`, `delete`, `onSnapshot`, `acquire`.

Données : `config/settings`, `config/logo`, `clients/<id>`, `invoices/<numéro>`.

## Règles à ne jamais casser

- **Numérotation** chronologique et continue, sans trou ni doublon, une série par an.
  Le numéro n'est attribué qu'à la validation.
- **Une facture validée ne se modifie plus** et ne se supprime pas : on l'annule par un avoir
  (série AV), puis on la duplique pour la refaire.
- **Chaque facture garde une copie** de tout ce qu'elle affiche (émetteur, client, TVA,
  conditions) : changer « Ma structure » ne modifie jamais une facture passée.
- **Mentions vérifiées avant validation :** nom et prénom avec « EI », adresse et SIRET,
  nom et adresse du client (et SIREN pour un professionnel), dates d'émission et de prestation,
  désignation, quantité et prix unitaire HT, totaux, mention de TVA, échéance, pénalités et
  indemnité de 40 € pour les clients professionnels, assurance RC pro, catégorie de l'opération,
  numéro sur chaque page du PDF.

## Facture électronique

À partir du 1er septembre 2027, les micro-entreprises devront émettre leurs factures entre
professionnels au format électronique, via une plateforme agréée. Ces PDF restent valables
pour les clients particuliers ; pour les clients professionnels, il faudra un export
Factur-X / UBL ou une connexion à une plateforme agréée.

## Idées à demander à Claude Code

- « Mets le dossier app/ en ligne sur Netlify et explique-moi comment l'installer sur mon iPhone. »
- « Ajoute une synchronisation Supabase pour retrouver mes factures sur tous mes appareils,
  en remplaçant uniquement src/standalone.js. »
- « Empaquette l'appli avec Capacitor pour en faire une appli iOS et Android. »
- « Ajoute les devis, transformables en facture en un clic. »
- « Prépare un export Factur-X pour la facture électronique de 2027. »

## Licences

jsPDF : MIT. Montserrat et Lexend : SIL Open Font License 1.1 (voir `assets/fonts/`).
Logo FAN'APA : propriété de FAN'APA.
