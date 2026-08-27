export const PAGE_LABELS = {
  '/': 'Home',
  '/visa-services': 'Visa Services',
  '/travel-insurance': 'Travel Insurance',
  '/flights': 'Flights',
  '/holidays': 'Holidays',
  '/airlines': 'Airlines',
  '/destinations': 'Destinations',
  '/send-inquiry': 'Send Inquiry',
  '/contact': 'Contact',
  '/privacy-policy': 'Privacy Policy',
  '/booking-conditions': 'Booking Conditions',
  '/terms-conditions': 'Terms',
  '/faqs': 'FAQs',
  '/meta-inquiry': 'Meta Inquiry',
}

export const CHANNEL_LABELS = {
  direct: 'Direct',
  organic: 'Organic search',
  'paid-search': 'Paid search',
  social: 'Social',
  'meta-ads': 'Meta ads',
  referral: 'Referral',
}

export const CHANNELS = Object.keys(CHANNEL_LABELS)
export const DEVICES = ['desktop', 'mobile', 'tablet']

export function normalizePath(value) {
  const raw = String(value || '/').split('?')[0].split('#')[0].trim() || '/'
  if (raw.length > 200) return raw.slice(0, 200)
  if (!raw.startsWith('/')) return `/${raw}`
  return raw.replace(/\/{2,}/g, '/')
}

export function pageLabel(path) {
  const clean = normalizePath(path)
  return PAGE_LABELS[clean] || clean
}

export function classifyChannel({ referrer = '', utmSource = '', utmMedium = '' } = {}) {
  const src = String(utmSource || '').toLowerCase()
  const med = String(utmMedium || '').toLowerCase()
  const ref = String(referrer || '').toLowerCase()
  const paid = /cpc|ppc|paid|ads|paid_social/.test(med)
  const socialHost = /facebook|instagram|twitter|t\.co|tiktok|linkedin|youtube|pinterest/.test(src + ' ' + ref)
  const searchHost = /google|bing|yahoo|duckduckgo|ecosia/.test(src + ' ' + ref)
  const metaSrc = /facebook|instagram|meta|fb|ig/.test(src) || /fbclid|igshid/.test(ref)

  if (metaSrc && (paid || /paid_social|cpc|ppc/.test(med) || src === 'facebook' || src === 'instagram')) {
    if (paid || src === 'facebook' || src === 'instagram' || src === 'meta') return 'meta-ads'
  }
  if (socialHost) return 'social'
  if (searchHost) return paid ? 'paid-search' : 'organic'
  if (src && src !== 'direct') {
    if (paid) return metaSrc ? 'meta-ads' : 'paid-search'
    return CHANNELS.includes(src) ? src : 'referral'
  }
  if (ref) return 'referral'
  return 'direct'
}

export function classifyDevice(ua = '') {
  const s = String(ua || '').toLowerCase()
  if (/ipad|tablet|playbook|silk/.test(s) && !/mobi/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android.+mobile|windows phone/.test(s)) return 'mobile'
  return 'desktop'
}

export function isBot(ua = '') {
  return /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|bingpreview|lighthouse|headless|phantom/i.test(String(ua || ''))
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function inRange(value, start, end) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date >= start && date < end
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function uniqueCount(items, key) {
  return new Set(items.map((item) => item[key]).filter(Boolean)).size
}

function summarize(hits) {
  const sessions = new Map()
  for (const hit of hits) {
    const id = hit.sessionId || hit._id
    if (!sessions.has(id)) {
      sessions.set(id, {
        sessionId: id,
        visitorId: hit.visitorId,
        channel: hit.channel || 'direct',
        device: hit.device || 'desktop',
        isNewVisitor: false,
        firstAt: hit.createdAt,
        lastAt: hit.createdAt,
        views: 0,
      })
    }
    const session = sessions.get(id)
    session.views += 1
    if (hit.isNewVisitor) session.isNewVisitor = true
    if (hit.createdAt && (!session.firstAt || hit.createdAt < session.firstAt)) session.firstAt = hit.createdAt
    if (hit.createdAt && (!session.lastAt || hit.createdAt > session.lastAt)) session.lastAt = hit.createdAt
  }

  const sessionRows = [...sessions.values()]
  const pageViews = hits.length
  const sessionCount = sessionRows.length
  const visitors = uniqueCount(hits, 'visitorId')
  const bounced = sessionRows.filter((row) => row.views === 1).length
  const bounceRate = sessionCount ? Math.round((bounced / sessionCount) * 100) : 0
  const pagesPerSession = sessionCount ? Math.round((pageViews / sessionCount) * 10) / 10 : 0
  const durationTotal = sessionRows.reduce((sum, row) => {
    const start = row.firstAt ? new Date(row.firstAt).getTime() : 0
    const end = row.lastAt ? new Date(row.lastAt).getTime() : start
    return sum + Math.max(0, end - start)
  }, 0)
  const avgSessionMs = sessionCount ? Math.round(durationTotal / sessionCount) : 0
  const newVisitors = uniqueCount(hits.filter((hit) => hit.isNewVisitor), 'visitorId')
  const returningVisitors = Math.max(0, visitors - newVisitors)

  const byChannelMap = new Map()
  for (const row of sessionRows) {
    const key = row.channel || 'direct'
    if (!byChannelMap.has(key)) byChannelMap.set(key, { label: key, sessions: 0, visitors: new Set() })
    const entry = byChannelMap.get(key)
    entry.sessions += 1
    if (row.visitorId) entry.visitors.add(row.visitorId)
  }
  const byChannel = CHANNELS.map((key) => {
    const row = byChannelMap.get(key)
    return {
      key,
      label: CHANNEL_LABELS[key],
      sessions: row?.sessions || 0,
      visitors: row ? row.visitors.size : 0,
    }
  }).filter((row) => row.sessions > 0)

  const byPageMap = new Map()
  for (const hit of hits) {
    const path = normalizePath(hit.path)
    if (!byPageMap.has(path)) byPageMap.set(path, { path, label: hit.page || pageLabel(path), views: 0, visitors: new Set() })
    const row = byPageMap.get(path)
    row.views += 1
    if (hit.visitorId) row.visitors.add(hit.visitorId)
  }
  const topPages = [...byPageMap.values()]
    .map((row) => ({ path: row.path, label: row.label, views: row.views, visitors: row.visitors.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)

  const byDeviceMap = new Map(DEVICES.map((key) => [key, 0]))
  for (const row of sessionRows) {
    const key = DEVICES.includes(row.device) ? row.device : 'desktop'
    byDeviceMap.set(key, (byDeviceMap.get(key) || 0) + 1)
  }
  const byDevice = DEVICES.map((key) => ({
    key,
    label: key[0].toUpperCase() + key.slice(1),
    sessions: byDeviceMap.get(key) || 0,
  }))

  return {
    pageViews,
    sessions: sessionCount,
    visitors,
    newVisitors,
    returningVisitors,
    bounceRate,
    bounced,
    pagesPerSession,
    avgSessionMs,
    byChannel,
    topPages,
    byDevice,
  }
}

function dailySeries(hits, dayKeys) {
  const views = new Map(dayKeys.map((key) => [key, 0]))
  const visitors = new Map(dayKeys.map((key) => [key, new Set()]))
  const sessions = new Map(dayKeys.map((key) => [key, new Set()]))

  for (const hit of hits) {
    const day = localDayKey(hit.createdAt)
    if (!day || !views.has(day)) continue
    views.set(day, views.get(day) + 1)
    if (hit.visitorId) visitors.get(day).add(hit.visitorId)
    if (hit.sessionId) sessions.get(day).add(hit.sessionId)
  }

  return dayKeys.map((date) => ({
    date,
    pageViews: views.get(date) || 0,
    visitors: visitors.get(date)?.size || 0,
    sessions: sessions.get(date)?.size || 0,
  }))
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms || 0) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (!minutes) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function buildTrafficAnalytics(hits, inquiries = [], { days = 14, now = new Date() } = {}) {
  const dayCount = [7, 14, 30].includes(Number(days)) ? Number(days) : 14
  const today = startOfDay(now)
  const currentStart = new Date(today)
  currentStart.setDate(currentStart.getDate() - (dayCount - 1))
  const currentEnd = new Date(today)
  currentEnd.setDate(currentEnd.getDate() + 1)
  const previousStart = new Date(currentStart)
  previousStart.setDate(previousStart.getDate() - dayCount)
  const previousEnd = currentStart

  const currentHits = hits.filter((hit) => inRange(hit.createdAt, currentStart, currentEnd))
  const previousHits = hits.filter((hit) => inRange(hit.createdAt, previousStart, previousEnd))
  const current = summarize(currentHits)
  const previous = summarize(previousHits)

  const inquiryCount = inquiries.filter((row) => inRange(row.createdAt, currentStart, currentEnd)).length
  const prevInquiryCount = inquiries.filter((row) => inRange(row.createdAt, previousStart, previousEnd)).length
  const conversionRate = current.visitors ? Math.round((inquiryCount / current.visitors) * 1000) / 10 : 0
  const prevConversionRate = previous.visitors ? Math.round((prevInquiryCount / previous.visitors) * 1000) / 10 : 0

  const dayKeys = []
  const cursor = new Date(currentStart)
  while (cursor < currentEnd) {
    dayKeys.push(localDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    days: dayCount,
    from: currentStart.toISOString(),
    to: currentEnd.toISOString(),
    pageViews: current.pageViews,
    sessions: current.sessions,
    visitors: current.visitors,
    newVisitors: current.newVisitors,
    returningVisitors: current.returningVisitors,
    bounceRate: current.bounceRate,
    pagesPerSession: current.pagesPerSession,
    avgSessionDuration: formatDuration(current.avgSessionMs),
    avgSessionMs: current.avgSessionMs,
    inquiries: inquiryCount,
    conversionRate,
    trend: {
      pageViews: pctChange(current.pageViews, previous.pageViews),
      sessions: pctChange(current.sessions, previous.sessions),
      visitors: pctChange(current.visitors, previous.visitors),
      bounceRate: pctChange(current.bounceRate, previous.bounceRate),
      conversionRate: pctChange(conversionRate, prevConversionRate),
      newVisitors: pctChange(current.newVisitors, previous.newVisitors),
    },
    series: dailySeries(currentHits, dayKeys),
    byChannel: current.byChannel,
    topPages: current.topPages,
    byDevice: current.byDevice,
  }
}
