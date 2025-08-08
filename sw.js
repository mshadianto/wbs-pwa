// Service Worker for WBS PWA
const CACHE_NAME = 'wbs-pwa-v1.0.0';
const API_BASE = 'https://mshadiant0.app.n8n.cloud/webhook';

// Assets to cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
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

// Fetch Event - Network First, Cache Fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API calls - Network first
  if (url.href.startsWith(API_BASE)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone the response before caching
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
            
            // Return offline data for specific endpoints
            if (url.pathname.includes('dashboard')) {
              return new Response(JSON.stringify({
                success: true,
                offline: true,
                summary: {
                  totalCases: 'Offline',
                  activeCases: 'Offline',
                  resolvedThisMonth: 'Offline',
                  complianceScore: 'Offline'
                },
                recentCases: []
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
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
  
  // Static assets - Cache first
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(request).then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
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
});

// Background Sync for offline submissions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  
  const pendingReports = requests.filter(req => 
    req.url.includes('/wbs-submit') && req.method === 'POST'
  );
  
  for (const request of pendingReports) {
    try {
      const response = await fetch(request.clone());
      
      if (response.ok) {
        // Remove from cache if successful
        await cache.delete(request);
        
        // Notify user
        self.registration.showNotification('Report Submitted', {
          body: 'Your offline report has been submitted successfully',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-96.png',
          vibrate: [200, 100, 200]
        });
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }
}

// Push Notifications
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from WBS',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/icon-96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-96.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('WBS Mobile', options)
  );
});

// Notification Click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-dashboard') {
    event.waitUntil(updateDashboard());
  }
});

async function updateDashboard() {
  try {
    const response = await fetch(`${API_BASE}/wbs-dashboard`);
    const data = await response.json();
    
    // Cache the updated data
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request(`${API_BASE}/wbs-dashboard`),
      new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (error) {
    console.error('Dashboard update failed:', error);
  }
}

// Message handling
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
