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

// Ao clicar na notificação, abre ou foca o painel admin
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/admin')
      }
    })
  )
})
