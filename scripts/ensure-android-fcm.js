import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { writeFileSync } from 'node:fs'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID
const PACKAGE = 'uk.co.robinholidays.admin'
const OUT = 'D:\\TravelApp\\google-services.json'

function credentials() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim()
  if (raw) {
    const parsed = JSON.parse(raw)
    if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    return parsed
  }
  return {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
  }, sa.private_key, { algorithm: 'RS256' })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(data.error_description || data.error || 'No Google access token')
  return data.access_token
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data.error?.message || data.error?.status || JSON.stringify(data.error || data)
    throw new Error(`${method} ${url} -> ${res.status} ${detail}`)
  }
  return data
}

async function main() {
  if (!PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID missing')
  const token = await accessToken(credentials())
  const list = await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/androidApps`)
  let app = (list.apps || []).find((row) => row.packageName === PACKAGE)
  if (!app) {
    app = await api(token, 'POST', `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/androidApps`, {
      packageName: PACKAGE,
      displayName: 'Robin Admin',
    })
  }
  const config = await api(token, 'GET', `https://firebase.googleapis.com/v1beta1/${app.name}/config`)
  const json = Buffer.from(config.configFileContents, 'base64').toString('utf8')
  writeFileSync(OUT, json)
  console.log('Wrote', OUT, 'for', PACKAGE)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
