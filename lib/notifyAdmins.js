import PushDevice from '../models/PushDevice.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function inquiryBody(inquiry) {
  const who = inquiry.name || 'New lead'
  const what = inquiry.service || inquiry.destination || inquiry.source || 'Website'
  return `${who} · ${what}`
}

export async function notifyNewInquiry(inquiry) {
  const devices = await PushDevice.findAll()
  const tokens = [...new Set(devices.map((row) => row.token).filter(Boolean))]
  if (!tokens.length) return { sent: 0 }

  const messages = tokens.map((to) => ({
    to,
    title: 'New inquiry',
    body: inquiryBody(inquiry),
    sound: 'default',
    priority: 'high',
    channelId: 'inquiries',
    data: {
      type: 'inquiry',
      inquiryId: inquiry._id || '',
    },
  }))

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  })

  const payload = await res.json().catch(() => ({}))
  const tickets = payload.data || []

  await Promise.all(tickets.map(async (ticket, index) => {
    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = tokens[index]
      if (token) await PushDevice.removeByToken(token)
    }
  }))

  return { sent: tokens.length }
}
