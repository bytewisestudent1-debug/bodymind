// Talks to the BodyMind backend. Same-origin by default (works behind the Vite
// proxy / a tunnel). The auth token is stored locally and sent on every request.

const API_URL = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'bodymind_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function headers(json = false) {
  const h = {}
  if (json) h['content-type'] = 'application/json'
  const t = getToken()
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function errorMessage(res, fallback) {
  try {
    const d = await res.json()
    return d.error || fallback
  } catch {
    return fallback
  }
}

// ── Meals ──
export async function getLogs() {
  const res = await fetch(`${API_URL}/log`, { headers: headers() })
  if (!res.ok) throw new Error(`GET /log failed: ${res.status}`)
  return res.json()
}

export async function createLog(payload) {
  const res = await fetch(`${API_URL}/log`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`POST /log failed: ${res.status}`)
  return res.json()
}

export async function clearLogs() {
  const res = await fetch(`${API_URL}/log`, { method: 'DELETE', headers: headers() })
  if (!res.ok) throw new Error(`DELETE /log failed: ${res.status}`)
  return res.json().catch(() => ({}))
}

// ── Body profile + coach ──
export async function getProfile() {
  const res = await fetch(`${API_URL}/profile`, { headers: headers() })
  if (!res.ok) throw new Error(`GET /profile failed: ${res.status}`)
  return res.json()
}

export async function updateProfile(payload) {
  const res = await fetch(`${API_URL}/profile`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `POST /profile failed: ${res.status}`))
  return res.json()
}

export async function weighIn(weight_kg) {
  const res = await fetch(`${API_URL}/weigh-in`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ weight_kg }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to record weight'))
  return res.json()
}

export async function getCoaching(message) {
  const res = await fetch(`${API_URL}/coach`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ message: message || undefined }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `POST /coach failed: ${res.status}`))
  return res.json()
}

export async function getPlan() {
  const res = await fetch(`${API_URL}/plan`, { method: 'POST', headers: headers(true), body: '{}' })
  if (!res.ok) throw new Error(await errorMessage(res, 'Failed to make a plan'))
  return res.json()
}

export async function bodyScan(file) {
  const res = await fetch(`${API_URL}/body-scan`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ file }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Body scan failed'))
  return res.json()
}

// ── Auth ──
export async function signup(email, password) {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Sign up failed'))
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Login failed'))
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function logout() {
  const res = await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: headers() })
  clearToken()
  return res.ok
}

export async function me() {
  const res = await fetch(`${API_URL}/auth/me`, { headers: headers() })
  if (!res.ok) throw new Error('not logged in')
  return res.json()
}
