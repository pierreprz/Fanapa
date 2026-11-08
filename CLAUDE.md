# CLAUDE.md — Factures FAN'APA

## Contexte
Appli de facturation de FAN'APA, micro-entreprise française d'activité physique adaptée
(entrepreneur individuel, franchise en base de TVA, art. 293 B du CGI). Utilisatrice non
technique, surtout sur iPhone (appli installée sur l'écran d'accueil). Interface en français avec
tutoiement ; tout ce que voit le client final (PDF, e-mails, relances) est au vouvoiement.

## Commandes
- `npm run build` : régénère `app/` (version autonome) et `dist/artifact/index.html` (claude.ai).
  Ne jamais éditer `app/` ni `dist/` à la main : modifier `src/` ou `assets/`, puis rebuild.
- `npm test` : tests unitaires de `src/core.js`, des en-têtes, du manifeste, de `netlify.toml`,
  et génération de PDF d'exemple.
- `npm run test:e2e` : parcours complet Playwright sur `app/`, servi avec `app/_headers` comme
  sur Netlify (une violation CSP ou une erreur JS fait échouer le test). Le lancer après tout
  changement d'interface ; `CHROME_PATH` pour utiliser un Chrome déjà installé.
- `npm start` : serveur local http://localhost:5173 (mêmes en-têtes que Netlify).

## Architecture
- `src/app.html` : gabarit unique, CSS et JS vanilla, aucune étape de compilation.
  Marqueurs remplacés par `build/build.mjs` : `<!--FONTS-->`, `<!--HEAD_EXTRA-->`,
  `<!--ADAPTER-->`, `/*__CORE__*/`, `/*__JSPDF_URLS__*/`, `{{LOGO_*}}`, `{{FONT_*}}`.
- `src/core.js` : logique pure sans DOM (formats, contrôles SIRET/SIREN/IBAN, numérotation,
  mentions, totaux, mails et relances, PDF jsPDF, CSV), exposée sous `window.FanapaCore` et
  testée en Node.
- Données, téléchargements et droits passent uniquement par
  `window.claude.use('db' | 'downloads' | 'user')`, le contrat de la plateforme claude.ai.
  `src/standalone.js` l'implémente hors claude.ai (IndexedDB + BroadcastChannel,
  téléchargement ou partage natif sur mobile). Il ajoute `use('share')` (partage d'un fichier
  avec objet et message, pour l'envoi depuis un téléphone) : l'appli ne le demande que si
  `window.FANAPA_STANDALONE`. `acquire()` y pose un vrai bail atomique en IndexedDB (clé
  `#lease:<chemin>`, libéré à l'écriture du document) et `get()` relit IndexedDB : deux onglets
  ne peuvent pas prendre le même numéro. Pour un serveur : écrire un autre adaptateur avec la
  même interface (`doc`/`collection`, `get`/`set`/`update`/`delete`, `onSnapshot`, `acquire`)
  sans toucher à l'interface.
- Chemins : `config/settings`, `config/logo`, `clients/<id>`, `invoices/<numéro>`
  (l'identifiant du document est le numéro de facture).
- Préférences locales (localStorage, par appareil) : `fanapa.draft.v1` (brouillon),
  `fanapa.backup.v1` (date de la dernière sauvegarde exportée), `fanapa.backup.snooze`,
  `fanapa.install.snooze`.
- PDF : jsPDF 4.2.1, Montserrat embarquée en base64, PDF chiffré (impression et copie
  autorisées, modification interdite). L'aperçu HTML (`paperHTML`) reproduit le PDF
  (`buildInvoicePDF`) : toute évolution de mise en page se fait dans les deux. Les PDF sont
  préparés à l'avance (`prepPdf` / `warmPdf`) à l'ouverture d'une fiche ou de l'envoi : sur
  iPhone, `navigator.share` doit partir dans la foulée du toucher.
- Version installable (`src/pwa/`) : `manifest.webmanifest` (start_url `./`), `sw.js` (l'appli
  est servie depuis le cache, ouverture immédiate et hors connexion ; seules les réponses 200
  sont mises en cache ; réponses redirigées nettoyées ; version = empreinte de index.html) et
  `_headers` (CSP, nosniff, `no-cache` sur sw.js), copié dans `app/_headers`. L'appli enregistre
  le service worker elle-même (`initPwa`) et affiche « Nouvelle version prête » au
  `controllerchange`. Toute ressource externe nouvelle doit être ajoutée à la CSP de `_headers`.
- Mise en ligne de la version autonome : **GitHub Pages**, réglé par l'utilisatrice sur la branche
  de travail, racine du dépôt → **https://pierreprz.github.io/Fanapa/app/**. `index.html` à la
  racine renvoie vers `app/` ; `.nojekyll` désactive Jekyll (fichiers servis tels quels). Chaque
  push sur la branche publiée redéploie le site (workflow « pages build and deployment »).
  GitHub Pages ignore `_headers` (pas de CSP côté GitHub). Les deux versions (GitHub Pages et
  claude.ai) ont des données et une numérotation séparées : une seule doit servir à facturer.
- Version claude.ai : page claude.ai privée **https://claude.ai/artifact/GuMWU7wDLNb8FW76ZGpfbc**
  (fichier publié : `dist/artifact/index.html`, contenu sans squelette HTML, `<title>` en tête :
  claude.ai ajoute doctype, head et body). Pour la mettre à jour : `npm run build`, puis outil
  Artifact, `action: publish`, `url` ci-dessus, en OMETTANT `capabilities` pour garder la
  déclaration en place : `db` avec la règle racine `{path: "", read: "admin", write: "admin"}`
  (données de facturation lisibles par le propriétaire et les éditeurs seulement), `downloads`,
  `user`. Ne jamais supprimer cette page : sa base de données (les factures) serait effacée.
- Mise en ligne de la version autonome (facultatif) : `netlify.toml` (publish `app`, build
  `node build/build.mjs`, sans dépendance).

## Invariants (obligations légales : ne jamais casser)
1. Numérotation chronologique et continue, sans trou ni doublon : `PREFIXE-AAAA-NNN`, série
   annuelle. Numéro attribué seulement à la validation par `claimNumber()`
   (acquire → get → set). Aucune suppression de facture.
2. Facture validée immuable : seul `status` évolue (`sentAt`, `remindedAt`, `reminders`,
   `paidAt`, `paidMethod`, `cancelledBy`, `cancelledAt`). Corriger = avoir (`kind: 'credit'`,
   série AV, `creditOf`).
3. Chaque facture stocke un instantané de tout ce qu'elle affiche (`seller`, `client`,
   `vat`, `terms`, `insurance`, `totals`) : ne jamais réafficher une facture passée à partir
   des réglages courants.
4. `checks()` vérifie avant validation : nom + « EI », adresse, SIRET, client (nom, adresse,
   SIREN si professionnel), dates d'émission et de prestation, désignation / quantité /
   PU HT, totaux, mention TVA, échéance, pénalités + indemnité de 40 € + escompte pour les
   professionnels, assurance RC pro, catégorie d'opération. Le numéro figure sur chaque page.
5. Montants en centimes entiers ; affichage avec `fmtMoney` (format français).
6. Toute donnée affichée passe par `esc()`, y compris celle qui vient du stockage ou d'une
   sauvegarde importée (logo compris : `cleanLogo()` n'accepte que JPEG/PNG en data URL).

## Style
- Couleurs dans les tokens `:root` : marine #0B3854, sarcelle #1A96A0, vert feuille #7AB648.
  Polices : Montserrat (titres, chiffres), Lexend (texte).
- Mobile d'abord : champs à 16 px minimum (pas de zoom sur iOS), barre d'onglets en bas,
  masquée pendant la saisie au clavier (`body.typing`). Bureau (≥ 960 px) : barre latérale,
  formulaire à gauche, aperçu A4 à droite.
- Encarts (`.notice`) : installation (`installNoticeHTML`), rappel de sauvegarde
  (`backupNoticeHTML`), en tête de la liste des factures.

## À savoir
- iPhone : l'appli installée garde ses données à part de Safari, et supprimer son icône efface
  ses données. D'où l'encart d'installation (« installe-la avant de commencer »), le rappel de
  sauvegarde (nouvelle facture depuis la dernière sauvegarde et plus de 7 jours, ou 10 factures)
  et l'export / import JSON (Ma structure → Sauvegarde ; contient aussi le logo). Ne pas retirer
  ces fonctions tant qu'il n'y a pas de serveur.
- Un brouillon garde la date du jour tant qu'elle n'a pas été choisie à la main (`dateAuto`,
  `serviceAuto`) : une appli installée peut rester ouverte plusieurs jours.
- À partir du 1er septembre 2027, les micro-entreprises devront émettre leurs factures B2B en
  électronique via une plateforme agréée : prévoir un export Factur-X / UBL ou une intégration.
