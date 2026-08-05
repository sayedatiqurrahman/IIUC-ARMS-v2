const CACHE_NAME = 'iiuc-arms-v15';
const FILE_CACHE = 'iiuc-arms-files-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/arms-logo-icon.png',
  '/tessdata/worker.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== FILE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Serve an opened file from the offline file cache, fetching + storing it on first view.
// pdf.js uses Range requests; strip them so we always cache + serve the FULL file —
// a cached 206 partial would break offline reopening.
async function handleFileRequest(request, url) {
  const cache = await caches.open(FILE_CACHE);
  const cached = await cache.match(url);
  if (cached) return cached;
  try {
    const fullRequest = new Request(url, { mode: 'cors' });
    const res = await fetch(fullRequest);
    if (res.ok) {
      const clone = res.clone();
      cache.put(url, clone).catch(() => {});
      return res;
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // File content from the files repo — cache-first so previously opened
  // files reopen offline (from history) without internet.
  if (url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(handleFileRequest(request, url.href));
    return;
  }

  // API calls: network only, never cache (except the public tree below)
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/github') {
      // Tree endpoint: stale-while-revalidate so course browsing works offline.
      // The app busts with ?_t=, so normalize the cache key to pathname-only.
      const treeUrl = url.origin + url.pathname;
      event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(treeUrl);
          const networkPromise = fetch(request).then((response) => {
            if (response.ok) cache.put(treeUrl, response.clone());
            return response;
          }).catch(() => cached);
          return cached || networkPromise;
        })
      );
    } else {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(JSON.stringify({ error: 'Offline — please try again' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );
    }
    return;
  }

  // Navigation: stale-while-revalidate (instant from cache, update in background)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached || caches.match('/'));

        return cached || networkPromise;
      })
    );
    return;
  }

  // Static assets (_next, fonts, images): cache-first
  if (url.pathname.startsWith('/_next/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|woff2?)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);

      return cached || networkPromise;
    })
  );
});
