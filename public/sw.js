// Service Worker — Barbearia Leste
// Compatibilidade: Android Chrome/Firefox (vibrate+sound), iOS 16.4+ PWA (silent, sem vibrate)
const STATIC_CACHE = 'leste-static-v2'
const NOTIF_ICON = '/android-chrome-192x192.png'
const NOTIF_BADGE = '/android-chrome-96x96.png'

// ─── Lifecycle ──────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim())
})

// ─── Cache estratégico ──────────────────────────────────────────────────────
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
  // Navigate requests: sem respondWith → browser faz fetch direto sem interferência
})

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildNotifOptions(data) {
  // iOS 16.4+ PWA: não suporta vibrate, actions nem silent=false (ignora).
  // Android Chrome: suporta tudo. Detectamos iOS pelo user agent no SW.
  const ua = (self.navigator?.userAgent ?? '').toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(ua)

  const base = {
    body: data.body ?? '',
    icon: data.icon ?? NOTIF_ICON,
    badge: NOTIF_BADGE,
    tag: data.tag ?? 'leste-notif',
    renotify: true,
    requireInteraction: !isIos, // iOS ignora requireInteraction; evitar flag para compatibilidade
    data: { url: data.url ?? '/reservas', ...( data.data ?? {} ) },
  }

  if (!isIos) {
    // Android/Desktop: adiciona vibrate e actions
    return {
      ...base,
      vibrate: [200, 100, 200, 100, 200],
      silent: false,
      actions: data.actions ?? [],
    }
  }

  // iOS: notificações minimalistas — qualquer campo não suportado gera erro silencioso
  return base
}

// ─── Push recebido do servidor (web-push / VAPID) ────────────────────────────
// Este listener é o que faz a notificação aparecer com o app fechado/minimizado.
// Vence a tela de bloqueio (iOS 16.4+/Android) quando PWA instalado como app.
self.addEventListener('push', (e) => {
  let data = {}

  try {
    data = e.data?.json() ?? {}
  } catch {
    try {
      data = { body: e.data?.text() ?? '' }
    } catch {}
  }

  const title = data.title ?? 'Leste Barbearia'

  e.waitUntil(
    self.registration.showNotification(title, buildNotifOptions(data))
  )
})

// ─── Renovação automática de subscription (raro mas importante) ─────────────
// Ocorre quando o browser rotaciona as chaves silenciosamente.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    (async () => {
      const vapidPublicKey = self.__VAPID_PUBLIC_KEY__
      if (!vapidPublicKey) return

      const convertKey = (b64) => {
        const padding = '='.repeat((4 - b64.length % 4) % 4)
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
        const raw = atob(base64)
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
      }

      try {
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertKey(vapidPublicKey),
        })
        // Notifica o app para salvar nova subscription
        const allClients = await clients.matchAll({ includeUncontrolled: true })
        for (const client of allClients) {
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() })
        }
        // Persiste via fetch direto
        await fetch('/api/push/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSub.toJSON()),
        })
      } catch {}
    })()
  )
})

// ─── Clique na notificação — abre/foca o app ────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close()

  const targetUrl = e.notification.data?.url ?? '/reservas'

  // Ação "ver" ou click direto
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})

// ─── Fechar notificação — analytics opcional ─────────────────────────────────
self.addEventListener('notificationclose', () => {
  // Pode-se enviar evento de analytics aqui futuramente
})

// ─── postMessage da página (exibe notificação com app aberto) ───────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, ...rest } = event.data
    event.waitUntil(
      self.registration.showNotification(title ?? 'Leste Barbearia', buildNotifOptions(rest))
    )
  }

  // Injeta VAPID public key para resubscription automática
  if (event.data?.type === 'SET_VAPID_KEY') {
    self.__VAPID_PUBLIC_KEY__ = event.data.vapidKey
  }
})
