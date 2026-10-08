// Minimal service worker so the app is installable (needed for the Android
// share target). It caches nothing and never intercepts requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
