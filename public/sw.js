// SW BUILD: 2026-08-17-network-first — never cache this file (see next.config.js
// /sw.js Cache-Control: no-store). Updates auto-install via skipWaiting + claim.
// IMMUTABLE: Next.js hashed build output (/_next/static/*). These files are
// content-addressed — the hash changes when the file changes — so they can be
// cached forever and NEVER deleted. Keeping them across updates is what makes
// the installed app open instantly after a deploy (no re-download of all JS).
const IMMUTABLE_CACHE = 'iiuc-arms-immutable-v3';

// SHELL: HTML pages + non-hashed app assets. NETWORK-FIRST so a deploy is
// visible on the very next reload — stale HTML is what kept users running old
// (broken) code. Cache only becomes a fallback when offline.
const SHELL_CACHE = 'iiuc-arms-shell-v3';

// FILE: opened file content from the files repo (offline reopening).
const FILE_CACHE = 'iiuc-arms-files-v3';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/arms-logo-icon.png',
  '/tessdata/worker.min.js',
];

function isImmutable(url) {
  return url.pathname.startsWith('/_next/static/');
}

// After fetching fresh HTML, download the JS/CSS chunks it references into the
// immutable cache so the next launch is fully warm (only changed chunks re-fetch).
async function prewarmLinkedAssets(htmlText, baseUrl) {
  const urls = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(htmlText))) {
    const rel = m[1];
    if (rel.startsWith('/_next/')) urls.add(rel);
  }
  const imm = await caches.open(IMMUTABLE_CACHE);
  for (const rel of urls) {
    const href = new URL(rel, baseUrl).href;
    try {
      if (await imm.match(href)) continue;
      const res = await fetch(href);
      if (res.ok) await imm.put(href, res.clone());
    } catch {}
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(async () => {
        // Warm the immutable cache right away so even the FIRST launch of a
        // freshly installed app renders instantly (no on-demand JS download).
        try {
          const res = await fetch('/');
          if (res.ok) prewarmLinkedAssets(await res.text(), self.location.origin);
        } catch {}
      })
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const keep = new Set([IMMUTABLE_CACHE, SHELL_CACHE, FILE_CACHE]);
      const imm = await caches.open(IMMUTABLE_CACHE);

      // Carry over hashed build assets from any previous cache (e.g. old
      // iiuc-arms-v17) so an update doesn't force a full re-download.
      for (const key of keys) {
        if (keep.has(key)) continue;
        const cache = await caches.open(key);
        const requests = await cache.keys();
        for (const req of requests) {
          const u = new URL(req.url);
          if (isImmutable(u)) {
            try {
              if (!(await imm.match(req.url))) {
                const res = await cache.match(req);
                if (res) await imm.put(req.url, res);
              }
            } catch {}
          }
        }
        await caches.delete(key);
      }
    })
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

  // Static viewer apps: never intercept.
  // Their HTML pages are loaded in an iframe — serving the PWA shell here
  // breaks them (the shell sets X-Frame-Options: deny).
  // opencv.js is a 13MB lazy asset; the browser HTTP cache handles it best,
  // and an SW cache-first hit could return an empty 504 response that would
  // permanently disable the detection engine. Let it go straight to network.
  if (
    url.pathname.startsWith('/webviewer/') ||
    url.pathname === '/opencv.js'
  ) {
    return;
  }

  // File content from the files repo — cache-first so previously opened
  // files reopen offline (from history) without internet.
  if (url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(handleFileRequest(request, url.href));
    return;
  }

  // API calls: network only, never cache (except the public tree and raw files below)
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/github') {
      // Tree endpoint: network-first so newly uploaded files always appear
      // immediately. The cache is only a fallback for offline use.
      const treeUrl = url.origin + url.pathname;
      event.respondWith(
        caches.open(SHELL_CACHE).then(async (cache) => {
          try {
            const response = await fetch(request);
            if (response.ok) cache.put(treeUrl, response.clone());
            return response;
          } catch {
            const cached = await cache.match(treeUrl);
            if (cached) return cached;
            return new Response(JSON.stringify({ error: 'Offline — please try again' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        })
      );
    } else if (url.pathname === '/api/github/raw') {
      // Raw file proxy: network-first with file cache fallback for offline PDF viewing.
      // Cache key uses the full URL including the ?url= param.
      event.respondWith(
        caches.open(FILE_CACHE).then(async (cache) => {
          try {
            const response = await fetch(request);
            if (response.ok) cache.put(request, response.clone());
            return response;
          } catch {
            const cached = await cache.match(request);
            if (cached) return cached;
            return new Response('Offline — file not cached', { status: 503 });
          }
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

  // Next.js App-Router data fetches (client-side navigation payloads). They
  // carry RSC / router headers and must NEVER be served from cache — a stale
  // response here keeps old UI code running after a deploy. Network only.
  if (
    request.headers.get('rsc') === '1' ||
    request.headers.has('next-router-prefetch') ||
    request.headers.has('next-router-state-tree')
  ) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Navigation: network-first. A deploy must show on the very next reload —
  // stale-while-revalidate is why users kept running old broken upload code.
  // The cache is only a fallback for offline / transient failures.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => {});
            try {
              const text = await response.clone().text();
              prewarmLinkedAssets(text, url.href).catch(() => {});
            } catch {}
          }
          return response;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/');
          if (fallback) return fallback;
          return new Response(
            '<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head>' +
            '<body style="font-family:sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0">' +
            '<div style="text-align:center"><h2>You&apos;re offline</h2><p>Connect to the internet and try again.</p></div>' +
            '</body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })
    );
    return;
  }

  // Hashed build assets (/_next/static/*): cache-first, kept forever.
  if (isImmutable(url)) {
    event.respondWith(
      caches.open(IMMUTABLE_CACHE).then(async (cache) => {
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

  // Other static assets (fonts, images, non-hashed css/js): cache-first.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|woff2?)$/i)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
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
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);

      if (cached) return cached;
      const networkResponse = await networkPromise;
      if (networkResponse) return networkResponse;
      return new Response('', { status: 504 });
    })
  );
});
