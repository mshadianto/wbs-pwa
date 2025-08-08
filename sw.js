// Service Worker for WBS PWA
const CACHE_NAME = 'wbs-pwa-v1.0.0';
const API_BASE = 'https://mshadiant0.app.n8n.cloud/webhook';

// URLs to cache
const urlsToCache = [
  '/wbs-pwa/',
  '/wbs-pwa/index.html',
  '/wbs-pwa/manifest.json',
  'https://via.placeholder.com/192/667eea/ffffff?text=WBS',
  'https://via.placeholder.com/512/667eea/ffffff?text=WBS'
];

// Install Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.log('Cache failed:', err))
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API calls - Network first, fallback to cache
  if (url.href.startsWith(API_BASE)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone response before caching
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
          
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(request).then(response => {
            if (response) {
              return response;
            }
            
            // Return offline response for dashboard
            if (url.pathname.includes('dashboard')) {
              return new Response(JSON.stringify({
                success: true,
                offline: true,
                summary: {
                  totalCases: 'Offline',
                  activeCases: 'Offline',
                  resolvedThisMonth: 'Offline',
                  complianceScore: 'Offline'
                }
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
            // Default offline response
            return new Response(JSON.stringify({
              error: 'Offline',
              message: 'No internet connection'
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }
  
  // For GitHub Pages specific paths
  if (url.pathname.startsWith('/wbs-pwa')) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          return response;
        }
        return fetch(request).then(response => {
          // Only cache successful responses
          if (!response || response.status !== 200) {
            return response;
          }
          
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
          
          return response;
        });
      })
    );
    return;
  }
  
  // For all other requests (external resources like placeholder.com)
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

// Background Sync for offline submissions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  console.log('Syncing offline reports...');
  // Implementation for syncing offline reports
  // This would check IndexedDB or cache for pending reports
  // and send them when connection is restored
}

// Listen for messages from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});
