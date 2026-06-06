import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notifyMercadoPagoAppointmentStatusChange } from './webhook-notifications'

function createAppointment(overrides: Partial<Parameters<typeof notifyMercadoPagoAppointmentStatusChange>[0]['appointment']> = {}) {
  return {
    client_id: 'user-1',
    client_name: 'João',
    service_name_snapshot: 'Corte + Barba',
    date: '2026-04-20',
    start_time: '14:30:00',
    current_status: 'aguardando_pagamento',
    expected_payment_date: null,
    ...overrides,
  }
}

describe('mercadopago webhook notifications', () => {
  it('aguarda apenas o push de admin quando quita fiado já concluído', async () => {
    const adminCalls: Array<{ title: string; body: string; url: string; tag: string }> = []
    const userCalls: Array<{ userId: string }> = []

    const result = await notifyMercadoPagoAppointmentStatusChange(
      {
        appointmentId: 'appt-1',
        nextStatus: 'confirmado',
        appointment: createAppointment({
          current_status: 'concluido',
          expected_payment_date: '2026-04-10',
        }),
      },
      {
        notifyUser: async (userId) => {
          userCalls.push({ userId })
        },
        notifyAdmins: async (payload) => {
          adminCalls.push(payload)
        },
      }
    )

    assert.deepEqual(result, { kind: 'fiado-quitado' })
    assert.equal(userCalls.length, 0)
    assert.deepEqual(adminCalls, [
      {
        title: '💰 Fiado quitado via Mercado Pago',
        body: 'João pagou o agendamento de 20/04/2026 às 14:30',
        url: '/admin',
        tag: 'admin-fiado-quitado-appt-1',
      },
    ])
  })

  it('mantém o aviso do admin mesmo se o push do cliente falhar', async () => {
    const adminCalls: Array<{ title: string; body: string; url: string; tag: string }> = []
    const userCalls: Array<{ userId: string; title: string }> = []

    const result = await notifyMercadoPagoAppointmentStatusChange(
      {
        appointmentId: 'appt-2',
        nextStatus: 'confirmado',
        appointment: createAppointment(),
      },
      {
        notifyUser: async (userId, payload) => {
          userCalls.push({ userId, title: payload.title })
          throw new Error('push offline')
        },
        notifyAdmins: async (payload) => {
          adminCalls.push(payload)
        },
      }
    )

    assert.deepEqual(result, { kind: 'pagamento-confirmado' })
    assert.deepEqual(userCalls, [{ userId: 'user-1', title: '💳 Pagamento confirmado!' }])
    assert.deepEqual(adminCalls, [
      {
        title: '💳 Pagamento recebido',
        body: 'João — Corte + Barba em 20/04/2026 às 14:30',
        url: '/admin',
        tag: 'admin-pagamento-appt-2',
      },
    ])
  })

  it('não envia notificação quando o webhook muda para cancelado', async () => {
    const adminCalls: Array<unknown> = []
    const userCalls: Array<unknown> = []

    const result = await notifyMercadoPagoAppointmentStatusChange(
      {
        appointmentId: 'appt-3',
        nextStatus: 'cancelado',
        appointment: createAppointment(),
      },
      {
        notifyUser: async (_userId, payload) => {
          userCalls.push(payload)
        },
        notifyAdmins: async (payload) => {
          adminCalls.push(payload)
        },
      }
    )

    assert.deepEqual(result, { kind: 'none' })
    assert.equal(userCalls.length, 0)
    assert.equal(adminCalls.length, 0)
  })
})