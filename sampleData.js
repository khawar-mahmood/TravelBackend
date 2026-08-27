export const SAMPLE_INQUIRIES = [
  { name: 'Oliver Smith', email: 'oliver@example.co.uk', phone: '+44 7700 900111', service: 'Holiday Package', destination: 'Paris', travelDate: '2026-08-12', message: 'Looking for a 4-night romantic break for 2 adults.', source: 'inquiry-form', status: 'new' },
  { name: 'Amelia Jones', email: 'amelia@example.co.uk', phone: '+44 7700 900222', service: 'Flights', destination: 'Amsterdam', travelDate: '2026-07-20', message: 'Return flights from London, flexible dates.', source: 'flight-search', status: 'new' },
  { name: 'Harry Wilson', email: 'harry@example.co.uk', phone: '+44 7700 900333', service: 'Visa Services', destination: 'Italy', travelDate: '2026-09-01', message: 'Need help with a Schengen visa for Rome.', source: 'contact-form', status: 'in_process' },
  { name: 'Sophie Taylor', email: 'sophie@example.co.uk', phone: '+44 7700 900444', service: 'Holiday Package', destination: 'Barcelona', travelDate: '2026-10-05', message: 'Family of 4, sun and city break.', source: 'inquiry-form', status: 'in_process' },
  { name: 'George Brown', email: 'george@example.co.uk', phone: '+44 7700 900555', service: 'Flights', destination: 'Vienna', travelDate: '2026-08-30', message: 'Business class, one way.', source: 'flight-search', status: 'complete' },
  { name: 'Isla Davies', email: 'isla@example.co.uk', phone: '+44 7700 900666', service: 'Holiday Package', destination: 'Prague', travelDate: '2026-11-12', message: 'Twin city Vienna & Prague.', source: 'inquiry-form', status: 'failed' },
]

const SAMPLE_PAGES = [
  '/',
  '/flights',
  '/holidays',
  '/visa-services',
  '/travel-insurance',
  '/destinations',
  '/send-inquiry',
  '/contact',
  '/airlines',
  '/meta-inquiry',
]

const SAMPLE_CHANNELS = [
  { utmSource: '', utmMedium: '', referrer: '', weight: 8 },
  { utmSource: 'google', utmMedium: 'organic', referrer: 'https://www.google.com/', weight: 6 },
  { utmSource: 'facebook', utmMedium: 'paid_social', referrer: 'https://www.facebook.com/', weight: 4 },
  { utmSource: 'instagram', utmMedium: 'paid_social', referrer: 'https://www.instagram.com/', weight: 3 },
  { utmSource: '', utmMedium: '', referrer: 'https://www.bing.com/', weight: 2 },
  { utmSource: '', utmMedium: '', referrer: 'https://www.tripadvisor.co.uk/', weight: 2 },
]

function pickWeighted(items, seed) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0)
  let cursor = seed % total
  for (const item of items) {
    cursor -= item.weight || 1
    if (cursor < 0) return item
  }
  return items[0]
}

/** Realistic browsing sessions for local memory-mode dashboards. */
export function buildSampleTrafficHits(now = new Date()) {
  const hits = []
  const seenVisitors = new Set()
  let session = 0

  for (let dayOffset = 20; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now)
    day.setHours(9, 0, 0, 0)
    day.setDate(day.getDate() - dayOffset)
    const sessionCount = 5 + ((dayOffset * 3) % 7)

    for (let i = 0; i < sessionCount; i += 1) {
      session += 1
      const visitorIndex = (session * 7 + dayOffset) % 42
      const visitorId = `seed-v-${visitorIndex}`
      const sessionId = `seed-s-${session}`
      const isNewVisitor = !seenVisitors.has(visitorId)
      seenVisitors.add(visitorId)
      const channel = pickWeighted(SAMPLE_CHANNELS, session + dayOffset)
      const device = ['desktop', 'mobile', 'mobile', 'tablet'][(session + i) % 4]
      const pageCount = 1 + ((session + dayOffset) % 4)
      const startMin = (i * 17 + dayOffset * 3) % 480

      for (let p = 0; p < pageCount; p += 1) {
        const createdAt = new Date(day)
        createdAt.setMinutes(startMin + p * 4)
        hits.push({
          path: SAMPLE_PAGES[(session + p + dayOffset) % SAMPLE_PAGES.length],
          referrer: p === 0 ? channel.referrer : '',
          utmSource: p === 0 ? channel.utmSource : '',
          utmMedium: p === 0 ? channel.utmMedium : '',
          visitorId,
          sessionId,
          device,
          isNewVisitor: isNewVisitor && p === 0,
          createdAt,
        })
      }
    }
  }

  return hits
}
