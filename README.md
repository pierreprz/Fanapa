# Factures FAN'APA

Appli de facturation pour FAN'APA, micro-entreprise d'activité physique adaptée :

- factures conformes (toutes les mentions obligatoires sont vérifiées avant validation) ;
- **brouillons** : une facture se garde en brouillon (sans numéro, modifiable, même incomplète)
  ou se valide **définitivement** ; validée, elle ne se modifie plus et s'annule par un avoir ;
- numérotation automatique et continue : FA-2026-001, puis 002, etc. ; impossible de choisir ou
  de sauter un numéro (réglages verrouillés dès la première facture) ;
- PDF avec le logo, protégé contre la modification ;
- envoi au client : sur iPhone, « Ouvrir Gmail » (ou Mail, Outlook) ouvre un nouveau mail avec
  l'adresse du client (reprise de sa fiche), l'objet et le message mis en forme ; il reste à
  joindre le PDF, enregistré juste avant dans Fichiers (trombone 📎). Variante en un geste : PDF
  joint, adresse à coller. Sur ordinateur, e-mail pré-rempli (Gmail, Mail, Outlook) ;
- suivi des paiements, **relances** des factures en retard, avoirs, PDF « facture acquittée » pour
  les mutuelles ;
- livre des recettes et registre des factures en CSV, encaissements par trimestre pour l'Urssaf ;
- « Ma structure » (nom, SIRET, adresse…) et les **clients s'enregistrent tout seuls** pendant la
  saisie, y compris un nouveau client tapé dans une facture pas encore validée ;
- appli installable sur le téléphone, qui fonctionne **sans réseau** et se met à jour toute seule ;
- rappel de **sauvegarde** tant que des factures ne sont que sur l'appareil.

## Où ouvrir l'appli

| Version | Adresse | Données |
| --- | --- | --- |
| **Appli pour iPhone** (GitHub Pages) | **https://pierreprz.github.io/Fanapa/app/** | sur le téléphone, marche sans réseau |
| Page claude.ai | https://claude.ai/artifact/GuMWU7wDLNb8FW76ZGpfbc | en ligne, avec ton compte Claude |

> **Factures dans une seule version.** Chacune a ses propres données et sa propre numérotation :
> facturer dans les deux donnerait deux factures FA-2026-001, ce qui est interdit. Pour passer de
> l'une à l'autre : Ma structure → Sauvegarde → Exporter dans l'ancienne, puis Importer dans la
> nouvelle.

## L'appli pour iPhone (GitHub Pages)

GitHub publie la branche du dépôt (réglage Settings → Pages, depuis la racine) : la page
https://pierreprz.github.io/Fanapa/ renvoie vers l'appli, dans `app/`. Chaque push sur la branche
met le site à jour en une minute environ, et l'appli installée propose alors « Mettre à jour ».
Pour l'installer sur l'iPhone, suis « Installer la version autonome sur iPhone » plus bas (l'appli
affiche aussi les étapes elle-même). Ses factures sont enregistrées **sur le téléphone** :
exporte une sauvegarde régulièrement (l'appli te le rappelle).

## L'appli en ligne sur claude.ai

**Adresse : https://claude.ai/artifact/GuMWU7wDLNb8FW76ZGpfbc** (page privée : toi seul·e peux
l'ouvrir, connecté·e à ton compte Claude).

- Les factures, clients et réglages sont enregistrés **en ligne avec la page** : on les retrouve
  sur le téléphone comme sur l'ordinateur, et supprimer une icône ne fait rien perdre.
- Seuls le propriétaire et les éditeurs que tu ajouterais peuvent lire ou modifier ces données :
  même si le lien est partagé, un simple lecteur ne voit aucune facture.
- Sur iPhone, ouvre le lien dans **l'app Claude** : « Enregistrer le PDF » y ouvre le menu de
  partage, donc Mail ou Gmail avec la facture jointe. Il faut une connexion internet.
- **Ne supprime jamais cette page** : ses données seraient effacées avec elle. Exporte de temps en
  temps une sauvegarde (Ma structure → Sauvegarde).

**En mode application sur l'iPhone (icône sur l'écran d'accueil)**

1. Ouvre le lien dans **Safari**, connecte-toi à Claude si besoin et attends que l'appli s'affiche.
2. Touche **Partager** (carré avec une flèche vers le haut ; sur iOS 26, touche d'abord **⋯**).
3. Choisis **Sur l'écran d'accueil**, renomme en « Factures », laisse **Ouvrir en tant qu'app web**
   activé, puis touche **Ajouter**.
4. Au premier lancement, l'icône peut redemander la connexion à Claude : elle a sa propre session.

Si l'icône ouvre l'accueil de Claude au lieu des factures (iOS reprend parfois l'adresse de départ
du site), supprime-la (aucune facture n'est perdue, elles sont en ligne) et refais l'étape 3 en
**désactivant** « Ouvrir en tant qu'app web » : l'icône ouvrira alors directement la page des
factures, dans Safari.

Mettre à jour la page après une modification : `npm run build`, puis republier
`dist/artifact/index.html` à la même adresse (voir CLAUDE.md).

## Mettre la version autonome en ligne (facultatif, Netlify)

Le dossier `app/` est un site statique complet (aucun serveur nécessaire) qui marche aussi sans
réseau. Deux façons de le publier, au choix :

**A. Depuis GitHub (recommandé : chaque modification se publie toute seule)**

1. Sur [app.netlify.com](https://app.netlify.com), « Add new project » → « Import an existing project » → GitHub.
2. Choisis le dépôt `fanapa` et la branche à publier.
3. Ne touche à rien d'autre : `netlify.toml` indique déjà le dossier `app/` et la commande de build.
4. « Deploy ». L'adresse ressemble à `https://fanapa-factures.netlify.app` (modifiable dans
   « Site configuration → Change site name »).

**B. Par glisser-déposer (Netlify Drop, depuis un ordinateur)**

1. Ouvre [app.netlify.com/drop](https://app.netlify.com/drop) en étant connecté·e.
2. Glisse le dossier `app/` (ou une archive .zip de ce dossier) dans la page.
3. Pour une mise à jour : dans le site, onglet « Deploys », glisse de nouveau le dossier.

Les en-têtes de sécurité et de mise à jour (`app/_headers`) s'appliquent dans les deux cas.

## Installer la version autonome sur iPhone

(Pour la version claude.ai, il suffit d'ouvrir son lien dans l'app Claude.)

1. Ouvre l'adresse du site dans **Safari**.
2. Touche le bouton **Partager** (carré avec une flèche vers le haut ; sur iOS 26, il est dans le
   menu **⋯** en bas à droite).
3. Choisis **Sur l'écran d'accueil** (fais défiler si besoin), laisse « Ouvrir en tant qu'app web »
   activé, puis touche **Ajouter**.
4. Ouvre ensuite toujours l'appli depuis son icône : elle démarre instantanément, même sans réseau.

L'appli affiche elle-même ces étapes tant qu'elle n'est pas installée (et un bouton « Installer »
sur Android et sur ordinateur avec Chrome ou Edge).

> **Important — tes données restent sur ton téléphone.**
> - Sur iPhone, l'appli installée garde ses données à part de Safari : installe-la **avant** de
>   commencer. Si tu as déjà saisi des factures dans Safari, exporte une sauvegarde depuis Safari
>   (Ma structure → Sauvegarde) puis importe-la dans l'appli installée.
> - **Supprimer l'icône de l'appli efface aussi ses données.**
> - Exporte une sauvegarde régulièrement (l'appli te le rappelle) et range-la dans Fichiers →
>   iCloud Drive : les factures sont à conserver 10 ans. Pour retrouver les factures sur plusieurs
>   appareils, il faudra un serveur (voir « Idées » plus bas).

## Utiliser sans rien installer

Ouvre `app/index.html` dans Chrome, Safari ou Firefox : l'appli fonctionne directement (sans
l'installation sur l'écran d'accueil ni le mode hors connexion, qui demandent une adresse https).

## Développer

```bash
npm install                  # jsPDF (tests) et Playwright
npm run build                # régénère app/ et dist/artifact/
npm test                     # tests du cœur métier, en-têtes, manifeste + PDF d'exemple dans test/out/
npx playwright install chromium
npm run test:e2e             # parcours complet dans un vrai navigateur (CHROME_PATH=… pour un Chrome existant)
npm start                    # http://localhost:5173, avec les mêmes en-têtes que Netlify
```

Ne modifie jamais `app/index.html` à la main : change `src/`, puis `npm run build`.

Le parcours complet vérifie notamment : validation et numérotation, PDF, envoi, ouverture hors
connexion, détection d'une nouvelle version, rappel de sauvegarde, sauvegarde puis import sur un
autre navigateur (logo compris), relance d'une facture échue, verrou de numérotation entre deux
onglets, encart d'installation iPhone, liens qui ouvrent Gmail / Mail / Outlook sur iPhone avec
l'adresse du client et le message, et partage du PDF avec le message.

## Organisation

```
src/app.html        interface (HTML/CSS/JS sans framework) avec ses marqueurs de build
src/core.js         cœur métier : formats, contrôles, numérotation, mentions, relances, PDF, CSV
src/standalone.js   adaptateur hors claude.ai : stockage IndexedDB, verrou, téléchargement / partage
src/pwa/            manifeste, service worker et en-têtes HTTP (_headers) de la version installable
assets/             logo, polices (Montserrat, Lexend), jsPDF, icônes
build/build.mjs     assemble app/ (version autonome) et dist/artifact/ (version claude.ai)
build/serve.mjs     petit serveur local (applique app/_headers comme Netlify)
netlify.toml        mise en ligne depuis GitHub : publie app/ après le build
test/               tests unitaires (npm test) et parcours complet (npm run test:e2e)
app/                version prête à l'emploi (générée)
```

## Comment ça marche

L'interface n'accède aux données qu'à travers `window.claude.use('db' | 'downloads' | 'user')`.
Dans claude.ai, c'est la plateforme qui fournit ces fonctions ; ailleurs, `src/standalone.js`
les fournit avec le stockage du navigateur (plus `share` pour le partage sur téléphone). Pour
synchroniser plusieurs appareils, il suffit d'écrire un autre adaptateur (Supabase, Firebase…)
avec la même interface : `doc()` / `collection()`, `get`, `set`, `update`, `delete`,
`onSnapshot`, `acquire`.

Données : `config/settings`, `config/logo`, `clients/<id>`, `invoices/<numéro>`.

Version installable : le service worker sert l'appli depuis le cache (ouverture immédiate, même
hors connexion). Chaque build change sa version ; le navigateur télécharge la nouvelle en
arrière-plan et l'appli affiche « Nouvelle version prête · Mettre à jour ».

## Règles à ne jamais casser

- **Numérotation** chronologique et continue, sans trou ni doublon, une série par an.
  Le numéro n'est attribué qu'à la validation.
- **Une facture validée ne se modifie plus** et ne se supprime pas : on l'annule par un avoir
  (série AV), puis on la duplique pour la refaire. Seul son suivi évolue (envoi, relances,
  paiement, annulation).
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

- « Ajoute une synchronisation Supabase pour retrouver mes factures sur tous mes appareils,
  en remplaçant uniquement src/standalone.js. »
- « Ajoute les devis, transformables en facture en un clic. »
- « Prépare un export Factur-X pour la facture électronique de 2027. »
- « Empaquette l'appli avec Capacitor pour en faire une appli iOS et Android. »

## Licences

jsPDF : MIT. Montserrat et Lexend : SIL Open Font License 1.1 (voir `assets/fonts/`).
Logo FAN'APA : propriété de FAN'APA.
