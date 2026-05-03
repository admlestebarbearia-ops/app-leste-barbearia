import { NextResponse } from 'next/server'
import { sendPushToUser } from '@/app/api/push/actions'

// Rota de teste de push — protegida pelo mesmo secret do cron
// GET /api/push/test?userId=<uuid>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const secretParam = searchParams.get('secret')
  const authorized =
    !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    secretParam === cronSecret
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const result = await sendPushToUser(userId, {
    title: '🔔 Teste de notificação',
    body: 'Se você está vendo isso, as notificações push estão funcionando!',
    url: '/reservas',
    tag: 'push-test',
  })

  return NextResponse.json(result)
}
