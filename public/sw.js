// Service Worker — Barbearia Leste
const STATIC_CACHE = 'leste-static-v2'
const NOTIF_ICON = '/android-chrome-192x192.png'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      self.registration.navigationPreload?.enable(),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ?? fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      )
    )
    return
  }

  if (request.destination === 'image') {
    e.respondWith(
      caches.match(request).then(cached =>
        cached ?? fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      )
    )
    return
  }

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

// ─── Push recebido do servidor (web-push / VAPID) ────────────────────────────
// Este listener é o que faz a notificação aparecer com o app fechado/minimizado.
// Sem ele o push chega no SW mas não exibe nada ao usuário.
self.addEventListener('push', (e) => {
  let title = 'Leste Barbearia'
  let body = 'Você tem um lembrete.'
  let url = '/'
  let tag = 'barbearia-leste-notif'

  try {
    const data = e.data?.json()
    if (data?.title) title = data.title
    if (data?.body) body = data.body
    if (data?.url) url = data.url
    if (data?.tag) tag = data.tag
  } catch {}

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: NOTIF_ICON,
      badge: NOTIF_ICON,
      // vibrate é ignorado no iOS — funciona apenas no Android
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: false,
      tag,
      renotify: true,
      data: { url },
    })
  )
})

// ─── Clique na notificação — abre/foca o app ────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já há uma aba/janela do app aberta, foca ela
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Senão abre uma nova janela
      return clients.openWindow(url)
    })
  )
})

// ─── postMessage da página (fallback quando app está aberto) ─────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon } = event.data
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || NOTIF_ICON,
        badge: NOTIF_ICON,
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
