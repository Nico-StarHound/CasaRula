// Minimal service worker — exists so Chrome marks the app as installable
// (PWA). It is intentionally a pass-through: every request goes straight to
// the network, no caching. Caching is dangerous in our case because the
// app is fully dynamic (sessions, DB-backed) and stale responses could
// show wrong table states or accept invalid PINs.
//
// If we ever want offline / faster boot, this is where we'd add it.

self.addEventListener('install', (event) => {
  // Activate this SW immediately, replacing any previous version.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Take control of all open tabs without requiring a reload.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Pass-through. Letting fetch fall through to the network is what
  // Chrome looks for to consider the SW "real" and the app installable.
  // We don't actually intercept anything.
})
