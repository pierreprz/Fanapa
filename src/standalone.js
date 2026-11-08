/* =====================================================================
   FAN'APA — adaptateur « version autonome »
   ---------------------------------------------------------------------
   Dans claude.ai, la page reçoit ses capacités de la plateforme via
   window.claude.use('db' | 'user' | 'downloads'). Hors de claude.ai,
   ce fichier fournit les mêmes appels :
     - db        : base de données locale (IndexedDB, repli localStorage),
                   synchronisée entre les onglets du même navigateur ;
     - downloads : téléchargement classique, ou menu de partage natif
                   sur téléphone (le PDF arrive déjà joint dans Mail) ;
     - user      : utilisateur local, tous les droits.
   Pour synchroniser plusieurs appareils, remplace uniquement ce fichier
   par un adaptateur vers un serveur (Supabase, Firebase…) qui respecte
   la même interface : le reste de l'appli n'a pas à changer.
   ===================================================================== */
(function () {
  'use strict';
  if (window.claude && typeof window.claude.use === 'function') return; // déjà dans claude.ai
  window.FANAPA_STANDALONE = true;

  const DB_NAME = 'fanapa-factures';
  const STORE = 'docs';
  const LS_KEY = 'fanapa-factures.db';
  const mem = new Map();          // chemin -> document (copie en mémoire)
  const listeners = new Set();
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  let idb = null;
  let chan = null;
  try { chan = 'BroadcastChannel' in window ? new BroadcastChannel(DB_NAME) : null; } catch (e) { chan = null; }

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const parentOf = p => p.split('/').slice(0, -1).join('/');
  const err = (code, message) => ({ code, message });

  function checkPath(path, wantDoc) {
    const segs = String(path).split('/');
    if (!segs.length || segs.some(s => !s || s === '.' || s === '..' || !SEG.test(s) || s.length > 200) || segs.length > 16) {
      throw new TypeError('Chemin invalide : ' + path);
    }
    if (wantDoc !== (segs.length % 2 === 0)) {
      throw new TypeError((wantDoc ? 'Un document' : 'Une collection') + ' attend un nombre ' + (wantDoc ? 'pair' : 'impair') + ' de segments : ' + path);
    }
  }

  /* ---------- Persistance ---------- */
  function openIDB() {
    return new Promise(res => {
      let req;
      try { req = window.indexedDB && indexedDB.open(DB_NAME, 1); } catch (e) { return res(null); }
      if (!req) return res(null);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    });
  }
  function idbLoadAll(db) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const keys = st.getAllKeys();
      const vals = st.getAll();
      tx.oncomplete = () => res(keys.result.map((k, i) => [k, vals.result[i]]));
      tx.onerror = () => rej(tx.error);
    });
  }
  function idbGet(path) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(path);
      tx.oncomplete = () => res(rq.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  function idbWrite(path, val) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      if (val === undefined) st.delete(path); else st.put(val, path);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function lsSaveAll() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(mem.entries()))); }
    catch (e) { throw err('quota_exceeded', 'Stockage local plein ou bloqué'); }
  }

  let storageOk = true;
  const ready = (async () => {
    idb = await openIDB();
    if (idb) {
      try { (await idbLoadAll(idb)).forEach(([k, v]) => mem.set(k, v)); }
      catch (e) { idb = null; }
    }
    if (!idb) {
      try { localStorage.setItem(LS_KEY + '.test', '1'); localStorage.removeItem(LS_KEY + '.test'); }
      catch (e) { storageOk = false; }
      lsLoad().forEach(([k, v]) => mem.set(k, v));
    }
    // Demande au navigateur de ne pas effacer ces données (factures à conserver 10 ans)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* facultatif */ }
  })();

  async function persist(path, val) {
    await ready;
    if (val === undefined) mem.delete(path); else mem.set(path, clone(val));
    try {
      if (idb) await idbWrite(path, clone(val)); else lsSaveAll();
    } catch (e) {
      throw (e && e.code) ? e : err('unavailable', 'Écriture impossible pour le moment');
    }
    emit(path);
    if (chan) { try { chan.postMessage({ path }); } catch (e) { /* onglet unique */ } }
  }
  if (chan) {
    chan.onmessage = async ev => {
      const path = ev && ev.data && ev.data.path;
      if (typeof path !== 'string') return;
      await ready;
      let v;
      if (idb) { try { v = await idbGet(path); } catch (e) { return; } }
      else { const found = lsLoad().find(([k]) => k === path); v = found ? found[1] : undefined; }
      if (v === undefined) mem.delete(path); else mem.set(path, v);
      emit(path);
    };
  }

  /* ---------- Instantanés ---------- */
  function docSnap(path) {
    const d = mem.get(path);
    return { id: path.split('/').pop(), exists: d !== undefined, data: () => clone(d), metadata: META };
  }
  function colSnap(path) {
    const docs = Array.from(mem.keys()).filter(k => parentOf(k) === path).sort().map(docSnap);
    return {
      docs, size: docs.length, empty: !docs.length, metadata: META,
      docChanges: () => docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i }))
    };
  }
  function emit(path) {
    listeners.forEach(l => {
      const hit = l.kind === 'doc' ? l.path === path : parentOf(path) === l.path;
      if (!hit) return;
      try { l.next(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)); } catch (e) { console.error(e); }
    });
  }
  function subscribe(kind, path, next) {
    const l = { kind, path, next };
    listeners.add(l);
    ready.then(() => { if (listeners.has(l)) next(kind === 'doc' ? docSnap(path) : colSnap(path)); });
    return () => { listeners.delete(l); };
  }
  function mergeDeep(a, b) {
    const out = Object.assign({}, a);
    Object.keys(b).forEach(k => {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mergeDeep(out[k], v);
      else out[k] = clone(v);
    });
    return out;
  }
  function body(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw err('invalid_argument', 'Le document doit être un objet');
    const s = JSON.stringify(data);
    if (s.length > 256 * 1024) throw err('invalid_argument', 'Document trop volumineux (256 Kio maximum)');
    return JSON.parse(s);
  }

  /* ---------- Références ---------- */
  function docRef(path) {
    checkPath(path, true);
    return {
      id: path.split('/').pop(),
      path,
      async get() { await ready; return docSnap(path); },
      async set(data) { if (!storageOk) throw err('unavailable', 'Stockage bloqué'); await persist(path, body(data)); },
      async update(data) {
        await ready;
        if (!mem.has(path)) throw err('invalid_argument', 'Document inexistant : ' + path);
        await persist(path, mergeDeep(mem.get(path), body(data)));
      },
      async delete() { await persist(path, undefined); },
      async acquire(opts) { return { acquired: true, version: 1, holder: opts && opts.holder, expiresAt: new Date(Date.now() + ((opts && opts.ttlMs) || 30000)).toISOString() }; },
      onSnapshot(next, onError) { return subscribe('doc', path, next, onError); },
      collection(sub) { return colRef(path + '/' + sub); }
    };
  }
  function colRef(path) {
    checkPath(path, false);
    const q = {
      path,
      doc(id) { return docRef(path + '/' + (id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)))); },
      async add(data) { const r = q.doc(); await r.set(data); return r; },
      async get() { await ready; return colSnap(path); },
      onSnapshot(next, onError) { return subscribe('col', path, next, onError); },
      // Filtres non utilisés par l'appli : renvoient la collection entière
      where() { return q; }, orderBy() { return q; }, limit() { return q; }
    };
    return q;
  }
  const db = { doc: docRef, collection: colRef };

  /* ---------- Téléchargements ---------- */
  const MIME = { pdf: 'application/pdf', csv: 'text/csv;charset=utf-8', json: 'application/json', txt: 'text/plain;charset=utf-8' };
  const downloads = {
    async save({ filename, data }) {
      if (!filename || data == null) throw err('bad_request', 'Fichier vide');
      const ext = String(filename).split('.').pop().toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      const blob = data instanceof Blob ? new Blob([data], { type }) : new Blob([data], { type });
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (touch && typeof navigator.canShare === 'function' && typeof File === 'function') {
        const file = new File([blob], filename, { type });
        if (navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: filename }); return { status: 'saved' }; }
          catch (e) {
            if (e && e.name === 'AbortError') throw err('declined', 'Partage annulé');
            // sinon (geste expiré, refus du navigateur…) : téléchargement classique
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: 'saved' };
    }
  };

  /* ---------- Utilisateur local ---------- */
  const user = {
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    id: async () => 'local',
    me: async () => ({ id: 'local', name: '', email: null, avatarUrl: '', color: '#1A96A0', isOwner: true, canEdit: true }),
    profiles: async ids => Object.fromEntries([].concat(ids || []).map(id => [id, { id, name: '', avatarUrl: '', color: '#1A96A0', email: null, isMe: id === 'local', guest: false }])),
    name: async () => '', email: async () => null, avatarUrl: async () => null, search: async () => []
  };

  window.claude = Object.freeze({
    async use(name) {
      if (name === 'db') { await ready; return storageOk || idb ? db : null; }
      if (name === 'downloads') return downloads;
      if (name === 'user') return user;
      return null;
    }
  });
})();
