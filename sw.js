/* Service worker: guarda la app en el celular para que abra sin internet.
   - La app (HTML, menú, ícono): primero intenta la red (para recibir cambios) y si no hay señal usa la copia guardada.
   - Fuentes y fotos ya vistas: se sirven desde la copia guardada.
   - Google Sheets y el menú del hotel NO pasan por aquí: los maneja la app. */
const VERSION = 'melo-v1';
const APP = ['./', './index.html', './menu.js', './icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION && k !== 'melo-extra').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero, con límite de tiempo; si falla o tarda, copia guardada.
async function redPrimero(req) {
  const cache = await caches.open(VERSION);
  try {
    const resp = await Promise.race([
      fetch(req),
      new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))
    ]);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

// Copia guardada primero (fuentes y fotos no cambian).
async function cachePrimero(req) {
  const cache = await caches.open('melo-extra');
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  try {
    const resp = await fetch(req);
    if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) { e.respondWith(redPrimero(req)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(cachePrimero(req)); return; }
  if (url.hostname === 'drive.google.com' && url.pathname === '/thumbnail') { e.respondWith(cachePrimero(req)); return; }
  // Todo lo demás (Google Sheets, menú del hotel) va directo a internet.
});
