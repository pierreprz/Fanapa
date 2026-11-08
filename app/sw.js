/* Service worker de la version autonome : l'appli s'ouvre instantanément et
   fonctionne hors connexion une fois installée.
   - La version du cache change à chaque build (empreinte de index.html) : le
     navigateur détecte la nouvelle version, la télécharge en arrière-plan,
     puis l'appli propose de recharger.
   - Seules les réponses valides (200) sont mises en cache : une page d'erreur
     ne peut jamais remplacer l'appli.
   - Les réponses redirigées sont « nettoyées » avant d'être servies à une
     navigation (sinon Safari et Chrome refusent de les afficher). */
const CACHE = 'fanapa-fe117bf840';
const ASSETS = [
  "./",
  "./manifest.webmanifest",
  "./vendor/jspdf.umd.min.js",
  "./fonts/fonts.css",
  "./fonts/lexend-latin-300-normal.woff2",
  "./fonts/lexend-latin-400-normal.woff2",
  "./fonts/lexend-latin-500-normal.woff2",
  "./fonts/lexend-latin-600-normal.woff2",
  "./fonts/montserrat-latin-500-normal.woff2",
  "./fonts/montserrat-latin-600-normal.woff2",
  "./fonts/montserrat-latin-700-normal.woff2",
  "./fonts/montserrat-latin-800-normal.woff2",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];
const SCOPE = new URL('./', self.location).pathname;          // ex. « / » ou « /factures/ »
const SHELL = new URL('./', self.location).href;              // l'appli (index.html)

async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
async function fetchOk(url) {
  const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
  if (!res.ok) throw new Error('HTTP ' + res.status + ' pour ' + url);
  return clean(res);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // L'appli elle-même : « ./ », ou « ./index.html » si l'hébergeur ne sert pas le dossier
    let shell;
    try { shell = await fetchOk(SHELL); } catch (err) { shell = await fetchOk(SHELL + 'index.html'); }
    await cache.put(SHELL, shell);
    // Tout le reste doit être en cache, sinon l'installation échoue et l'ancienne version reste active
    await Promise.all(ASSETS.filter(a => a !== './').map(async a => {
      const url = new URL(a, self.location).href;
      await cache.put(url, await fetchOk(url));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('fanapa-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isShell(url) {
  return url.pathname === SCOPE || url.pathname === SCOPE + 'index.html';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN de secours : réseau direct

  if (req.mode === 'navigate' && isShell(url)) {
    // L'appli : depuis le cache (ouverture immédiate, même hors connexion) ;
    // les mises à jour arrivent par une nouvelle version du service worker.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(SHELL);
      if (hit) return hit;
      try {
        const res = await clean(await fetch(req));
        if (res.ok) cache.put(SHELL, res.clone());
        return res;
      } catch (err) {
        const any = await caches.match(SHELL);
        if (any) return any;
        throw err;
      }
    })());
    return;
  }

  // Fichiers de l'appli : cache d'abord, puis réseau (et mise en cache si la réponse est valide)
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return req.mode === 'navigate' ? clean(res) : res;
  })());
});
