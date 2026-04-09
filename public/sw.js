// Service Worker — Barbearia Leste
const STATIC_CACHE = 'leste-static-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      // Inicia a requisição de navegação em paralelo com o boot do SW
      // elimina o overhead de esperar o SW iniciar antes de ir à rede
      self.registration.navigationPreload?.enable(),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Chunks JS/CSS do Next.js têm hash no nome — nunca mudam, cache permanente
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ?? fetch(request).then(res => {
          if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()))
          return res
        })
      )
    )
    return
  }

  // Imagens estáticas — cache-first
  if (request.destination === 'image') {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ?? fetch(request).then(res => {
          if (res.ok) caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()))
          return res
        })
      )
    )
    return
  }

  // Navegação — usa o preloadResponse (já foi disparado em paralelo com o boot do SW)
  if (request.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const preloaded = await e.preloadResponse
          if (preloaded) return preloaded
        } catch {}
        return fetch(request)
      })()
    )
    return
  }
})

// Push notifications via postMessage da página
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon } = event.data
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/logo2.png',
        badge: '/logo2.png',
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: false,
        tag: 'barbearia-leste-notif',
        renotify: true,
      })
    )
  }
})

// ─── Web Push (lembretes do servidor) ────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'Leste Barbearia', body: 'Você tem um lembrete.', url: '/agendar', tag: 'lembrete' }

  try {
    if (event.data) {
      const parsed = event.data.json()
      payload = { ...payload, ...parsed }
    }
  } catch (_) { /* ignora erro de parse */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      vibrate: [300, 100, 300],
      tag: payload.tag || 'lembrete',
      renotify: true,
      data: { url: payload.url || '/agendar' },
    })
  )
})

// Ao clicar na notificação, abre ou foca a URL correta
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/agendar'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
