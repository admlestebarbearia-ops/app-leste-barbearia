// Service Worker — Barbearia Leste
// Permite notificações na tela de bloqueio e em segundo plano

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Recebe mensagem da página para mostrar notificação via SW
// (funciona mesmo com a aba em segundo plano / tela bloqueada)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon } = event.data
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/android-chrome-192x192.png',
        badge: '/android-chrome-192x192.png',
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
