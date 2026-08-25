const CACHE_NAME = 'clear-maker-2c-v2.6.0';
const APP_SHELL = [
    './',
    './index.html',
    './student.css?v=2.6.0',
    './student.js?v=2.6.0',
    './vocabulary-data.js?v=2.6.0',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.allSettled(APP_SHELL.map(asset => cache.add(asset)))));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
    const isData = /\/vocabulary-(?:questions?\.json|data\.js)$/.test(new URL(event.request.url).pathname);
    event.respondWith(fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true })));
});
