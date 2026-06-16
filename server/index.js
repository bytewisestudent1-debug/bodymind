import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import pkg from 'pg'

const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed cloud Postgres (e.g. Render external URL) needs SSL; local Docker doesn't.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

const SYSTEM_PROMPT = `You are BodyMind, a smart food logger. The user describes or shows FOOD they ate.
- If it is NOT food (a greeting, a question, small talk, random text, or a non-food image): reply with exactly NOT_FOOD and nothing else.
- If it IS food but the wording is misspelled or ambiguous so it could reasonably mean different foods, do NOT guess. Respond with ONLY this JSON on a single line: {"action":"clarify","question":"<a short, specific question naming the item, e.g. Which kind of roll did you mean?>","options":["<food 1>","<food 2>","<food 3>"]} with 2-4 concrete options. Use clarify only when genuinely ambiguous.
- Otherwise (it is clearly food), respond with ONLY this JSON on a single line: {"food":"<the food name, spelling-corrected and written in clean, proper grammar with correct capitalization>","calories":<integer>,"protein":<integer>,"reply":"<one warm sentence about it ending with (X cal · Xg protein)>"}
Estimate calories and protein with realistic, accurate values based on typical nutrition data — never exaggerate or invent numbers. Output ONLY the JSON (or NOT_FOOD) — no extra text.`

const COACH_PROMPT = `You are Coach Remy 🥑💪 — a buff, hyped-up gym-bro nutrition coach who talks like a real friend: casual, cool, Gen-Z energy. Open with stuff like "yo", "wassup g", "lessgo", drop light slang and the odd emoji, keep it chill, funny and motivating. BUT you genuinely know nutrition — give real, accurate, useful advice (calories, protein, what to eat next) every single time. Use the exact numbers you are given and do the math carefully — never invent or guess data. Keep replies to 1-3 short sentences — quick and punchy — don't overdo the slang, and ALWAYS finish your sentences.
KEEP THE USER ON TRACK: tie advice back to their goal and today's numbers, and if they drift off-topic, hype them back to their nutrition, meals and progress.

Each turn you get the user's profile, daily targets, today's totals, and the foods they logged today — use ALL of it.

You can ALSO log foods AND workouts to the user's diary.
- When the user asks you to add / log / record a FOOD or meal (or says "I just ate ..."), respond with ONLY this JSON on a single line and nothing else:
{"action":"log","kind":"food","food":"<short description>","calories":<integer>,"protein":<integer>,"reply":"<one short hype sentence ending with (X cal · Xg protein)>"}
- When the user asks you to log / record EXERCISE or activity (or says "I just ran / worked out / did ..."), respond with ONLY this JSON on a single line and nothing else:
{"action":"log","kind":"exercise","food":"<short activity name>","calories":<integer calories BURNED, estimated from their body weight>,"reply":"<one short hype sentence ending with (~X cal burned)>"}
Estimate the numbers yourself. Never use JSON for anything except logging a food or an exercise.

For everything else, reply in normal casual text.`

const PLAN_PROMPT = `You are Coach Remy, a nutrition coach. Build the user a simple, realistic FULL-DAY plan that fits their goal and hits roughly their daily calorie and protein targets. Include exactly 4 meals (Breakfast, Lunch, Snack, Dinner) and ONE exercise/workout for the day.
Respond with ONLY this JSON on a single line and nothing else:
{"items":[{"label":"Breakfast — <food>","kind":"food","calories":<int>,"protein":<int>},{"label":"Lunch — <food>","kind":"food","calories":<int>,"protein":<int>},{"label":"Snack — <food>","kind":"food","calories":<int>,"protein":<int>},{"label":"Dinner — <food>","kind":"food","calories":<int>,"protein":<int>},{"label":"<workout, e.g. 30 min brisk walk>","kind":"exercise","calories":<int calories burned>}],"note":"<one short hype sentence>"}
Use real foods with accurate values. The four meals' calories should add up to roughly the daily calorie target and protein to roughly the protein target. Output ONLY the JSON.`

const EXERCISE_PROMPT = `You are BodyMind, an exercise logger. The user describes a workout or physical activity they did.
- If it is NOT an exercise or physical activity, reply with exactly NOT_EXERCISE and nothing else.
- Otherwise respond with ONLY this JSON on a single line: {"activity":"<clean activity name, proper grammar and capitalization>","calories":<integer calories burned>,"reply":"<one short encouraging sentence ending with (~X cal burned)>"}
Estimate calories BURNED realistically using the person's body weight (given below) and the activity's typical intensity and duration. If no duration is given, assume a typical session of about 30 minutes. Output ONLY the JSON (or NOT_EXERCISE).`

const BODY_PROMPT = `You are BodyMind, a supportive, body-positive fitness coach analyzing a photo the user shares. Reply warmly with:
1) A ROUGH visual weight estimate as a RANGE in both kg and lb (e.g. "roughly 75–85 kg / 165–185 lb"), clearly labelled as a rough visual guess — not a measurement.
2) A short, kind read of their visible build/composition (e.g. lean, athletic, a little softness) — never judgmental.
3) Their ACTUAL tracked weight change from the data provided below (started vs now, weight lost or gained) and how it lines up with their goal. If there's no history, encourage them to use "Weigh in" to track it.
4) A note on height: it can't be measured from a photo, and adult height is basically stable — if they want to track growth they should update it in their profile over time.
5) 2–3 practical next steps toward their goal.
Never give a body-fat percentage or any medical/diagnostic claim. Tell them to use the scale ("Weigh in") for accurate weight. End with one line: this is a rough visual estimate, not a precise or medical assessment.`

// ── Auth helpers (built-in crypto — no extra dependency) ──
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':')
  if (!salt || !hash) return false
  const test = crypto.scryptSync(password, salt, 64).toString('hex')
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(test, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}
// Resolve the user for a request. No/invalid token → shared 'user_1' guest.
async function userIdFromReq(req) {
  const token = bearer(req)
  if (!token) return 'user_1'
  const { rows } = await pool.query(`SELECT user_id FROM sessions WHERE token = $1`, [token])
  return rows[0]?.user_id || 'user_1'
}

function parseNutrition(text) {
  const match = text.match(/(\d+)\s*cal[^\d]*(\d+)\s*g/i)
  if (!match) return { calories: null, protein: null }
  return { calories: Number(match[1]), protein: Number(match[2]) }
}

// Pull a {"action":"log",...} object out of the coach's reply, if present.
function tryParseAction(text) {
  try {
    let s = String(text).trim()
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) s = fence[1].trim()
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const obj = JSON.parse(s.slice(start, end + 1))
    return obj && obj.action ? obj : null
  } catch {
    return null
  }
}

// Extract any JSON object from the model's reply (for cleaned food + nutrition).
function extractJson(text) {
  try {
    let s = String(text).trim()
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) s = fence[1].trim()
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

function computeTargets(p) {
  if (!p || !p.height_cm || !p.weight_kg) return {}
  const h = Number(p.height_cm)
  const w = Number(p.weight_kg)
  const age = Number(p.age) || 30
  const bmi = +(w / Math.pow(h / 100, 2)).toFixed(1)

  let bmr = 10 * w + 6.25 * h - 5 * age
  bmr += p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78
  const factor = p.activity === 'low' ? 1.2 : p.activity === 'high' ? 1.725 : 1.55
  const tdee = bmr * factor

  let calorieTarget = tdee
  if (p.goal === 'lose') calorieTarget = tdee - 500
  else if (p.goal === 'gain') calorieTarget = tdee + 400
  calorieTarget = Math.max(1200, Math.round(calorieTarget / 10) * 10)

  const proteinTarget = Math.round(w * (p.goal === 'lose' ? 1.8 : 1.6))
  return { bmi, calorieTarget, proteinTarget }
}

async function callGemini({ text, file, system, maxTokens }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in server/.env')

  const parts = []
  if (file?.data && file?.media_type) {
    parts.push({ inlineData: { mimeType: file.media_type, data: file.data } })
  }
  parts.push({ text })

  const body = {
    systemInstruction: { parts: [{ text: system || SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: maxTokens || 1024,
      temperature: 0.7,
      // Disable "thinking" on 2.5 models so the whole token budget goes to the
      // actual answer — otherwise replies get cut off mid-sentence.
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const out =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? ''
  if (!out.trim()) throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 300)}`)
  return out.trim()
}

async function initDb() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto').catch(() => {})
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token text PRIMARY KEY,
      user_id text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id text DEFAULT 'user_1',
      food_description text,
      calories int,
      protein int,
      ai_response text,
      created_at timestamptz DEFAULT now()
    )
  `)
  // Distinguish food (calories eaten) from exercise (calories burned).
  await pool.query(`ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS kind text DEFAULT 'food'`).catch(() => {})
  await pool.query(`
    CREATE TABLE IF NOT EXISTS body_profile (
      user_id text PRIMARY KEY DEFAULT 'user_1',
      height_cm numeric,
      weight_kg numeric,
      age int,
      sex text,
      goal text,
      activity text,
      updated_at timestamptz DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id text DEFAULT 'user_1',
      weight_kg numeric,
      created_at timestamptz DEFAULT now()
    )
  `)
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

// In production we serve the built frontend (dist/) from this same server, so the
// whole app is one origin — no CORS or separate API URL needed.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
const hasDist = fs.existsSync(distPath)
if (hasDist) app.use(express.static(distPath))

// ── Auth routes ──
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Enter an email and a password of at least 6 characters.' })
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES (lower($1), $2) RETURNING id, email`,
      [email, hashPassword(password)],
    )
    const user = rows[0]
    const token = crypto.randomBytes(32).toString('hex')
    await pool.query(`INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, [token, user.id])
    res.json({ token, email: user.email })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already registered.' })
    console.error('signup failed:', err)
    res.status(500).json({ error: 'Sign up failed' })
  }
})

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' })
  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = lower($1)`,
      [email],
    )
    const user = rows[0]
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password.' })
    }
    const token = crypto.randomBytes(32).toString('hex')
    await pool.query(`INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, [token, user.id])
    res.json({ token, email: user.email })
  } catch (err) {
    console.error('login failed:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.post('/auth/logout', async (req, res) => {
  const token = bearer(req)
  if (token) await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]).catch(() => {})
  res.json({ ok: true })
})

app.get('/auth/me', async (req, res) => {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Not logged in' })
  const { rows } = await pool.query(
    `SELECT u.email FROM sessions s JOIN users u ON u.id::text = s.user_id WHERE s.token = $1`,
    [token],
  )
  if (!rows[0]) return res.status(401).json({ error: 'Session expired' })
  res.json({ email: rows[0].email })
})

// ── Data routes (scoped to the resolved user) ──
app.get('/log', async (req, res) => {
  try {
    const uid = await userIdFromReq(req)
    const { rows } = await pool.query(
      `SELECT * FROM food_logs
       WHERE user_id = $1 AND created_at > now() - interval '60 days'
       ORDER BY created_at DESC`,
      [uid],
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /log failed:', err)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

app.post('/log', async (req, res) => {
  const { food_description, file, kind, calories: preCal, protein: prePro, prelogged } = req.body ?? {}
  const itemKind = kind === 'exercise' ? 'exercise' : 'food'
  if (!food_description && !file?.data) {
    return res.status(400).json({ error: 'food_description or file is required' })
  }
  try {
    const uid = await userIdFromReq(req)

    // Checklist item with a known estimate → log instantly, no AI call.
    if (prelogged && food_description && Number.isFinite(Number(preCal))) {
      const cal = Math.round(Number(preCal))
      const pro = itemKind === 'food' && Number.isFinite(Number(prePro)) ? Math.round(Number(prePro)) : null
      const reply =
        itemKind === 'exercise'
          ? `${food_description} — about ${cal} cal burned. 🔥`
          : `${food_description} (${cal} cal · ${pro ?? 0}g protein)`
      const { rows } = await pool.query(
        `INSERT INTO food_logs (user_id, food_description, calories, protein, ai_response, kind)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [uid, food_description, cal, pro, reply, itemKind],
      )
      return res.json(rows[0])
    }

    // Exercise (AI estimates calories burned using body weight).
    if (itemKind === 'exercise' && food_description) {
      const pr = await pool.query(`SELECT weight_kg FROM body_profile WHERE user_id = $1`, [uid])
      const w = pr.rows[0]?.weight_kg
      const ctx = `My body weight is ${w ? `${w} kg` : 'about 70 kg (unknown)'}.\nActivity: ${food_description}`
      const aiResponse = await callGemini({ text: ctx, system: EXERCISE_PROMPT, maxTokens: 300 })
      if (aiResponse.toUpperCase().startsWith('NOT_EXERCISE')) {
        return res.json({
          notExercise: true,
          message: 'That doesn’t look like an exercise — try e.g. “30 min run” or “100 push-ups”.',
        })
      }
      const obj = extractJson(aiResponse)
      let activity = food_description
      let cal = null
      let reply = aiResponse
      if (obj && obj.activity) {
        activity = String(obj.activity)
        cal = Number.isFinite(Number(obj.calories)) ? Math.round(Number(obj.calories)) : null
        reply = obj.reply || `Logged ${activity}.`
      }
      const { rows } = await pool.query(
        `INSERT INTO food_logs (user_id, food_description, calories, protein, ai_response, kind)
         VALUES ($1, $2, $3, NULL, $4, 'exercise') RETURNING *`,
        [uid, activity, cal, reply],
      )
      return res.json(rows[0])
    }

    const instruction =
      food_description ||
      (file?.media_type === 'application/pdf'
        ? 'Estimate the nutrition for the food described in this document.'
        : 'Identify the food shown and estimate its nutrition.')

    const aiResponse = await callGemini({ text: instruction, file })

    // Food-only: if the AI says it isn't food, don't log anything.
    if (aiResponse.toUpperCase().startsWith('NOT_FOOD')) {
      return res.json({
        notFood: true,
        message: 'I only log food — tell me what you ate (e.g. “two eggs and toast”) or upload a food photo.',
      })
    }

    const obj = extractJson(aiResponse)

    // Misspelled / ambiguous → ask the user to pick, don't log yet.
    if (obj && obj.action === 'clarify' && Array.isArray(obj.options) && obj.options.length) {
      return res.json({
        clarify: true,
        question: obj.question || 'Which did you mean?',
        options: obj.options.slice(0, 4).map(String),
      })
    }

    // Use the AI's cleaned, grammar-corrected food name (fallback to raw input).
    let description
    let calories
    let protein
    let reply
    if (obj && obj.food) {
      description = String(obj.food)
      calories = Number.isFinite(Number(obj.calories)) ? Math.round(Number(obj.calories)) : null
      protein = Number.isFinite(Number(obj.protein)) ? Math.round(Number(obj.protein)) : null
      reply = obj.reply || `Logged ${description}.`
    } else {
      reply = aiResponse
      const n = parseNutrition(aiResponse)
      calories = n.calories
      protein = n.protein
      description = food_description || (file?.media_type === 'application/pdf' ? '📄 Document' : '📷 Photo')
    }

    const { rows } = await pool.query(
      `INSERT INTO food_logs (user_id, food_description, calories, protein, ai_response, kind)
       VALUES ($1, $2, $3, $4, $5, 'food')
       RETURNING *`,
      [uid, description, calories, protein, reply],
    )
    res.json(rows[0])
  } catch (err) {
    console.error('POST /log failed:', err)
    res.status(500).json({ error: 'Failed to process meal' })
  }
})

app.delete('/log', async (req, res) => {
  try {
    const uid = await userIdFromReq(req)
    const result = await pool.query(
      `DELETE FROM food_logs WHERE created_at::date = current_date AND user_id = $1`,
      [uid],
    )
    res.json({ deleted: result.rowCount })
  } catch (err) {
    console.error('DELETE /log failed:', err)
    res.status(500).json({ error: 'Failed to clear log' })
  }
})

app.get('/profile', async (req, res) => {
  try {
    const uid = await userIdFromReq(req)
    const { rows } = await pool.query(`SELECT * FROM body_profile WHERE user_id = $1`, [uid])
    const profile = rows[0] || null

    const wl = await pool.query(
      `SELECT weight_kg FROM weight_logs WHERE user_id = $1 ORDER BY created_at ASC`,
      [uid],
    )
    let trend = null
    if (wl.rows.length >= 2) {
      const first = Number(wl.rows[0].weight_kg)
      const last = Number(wl.rows[wl.rows.length - 1].weight_kg)
      trend = +(last - first).toFixed(1)
    }
    res.json({ profile, targets: computeTargets(profile), trend })
  } catch (err) {
    console.error('GET /profile failed:', err)
    res.status(500).json({ error: 'Failed to fetch profile' })
  }
})

app.post('/profile', async (req, res) => {
  const { height_cm, weight_kg, age, sex, goal, activity } = req.body ?? {}
  try {
    const uid = await userIdFromReq(req)
    const { rows } = await pool.query(
      `INSERT INTO body_profile (user_id, height_cm, weight_kg, age, sex, goal, activity, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id) DO UPDATE SET
         height_cm = $2, weight_kg = $3, age = $4, sex = $5, goal = $6, activity = $7, updated_at = now()
       RETURNING *`,
      [uid, height_cm, weight_kg, age, sex, goal, activity],
    )
    if (weight_kg) {
      await pool.query(`INSERT INTO weight_logs (user_id, weight_kg) VALUES ($1, $2)`, [uid, weight_kg])
    }
    res.json({ profile: rows[0], targets: computeTargets(rows[0]) })
  } catch (err) {
    console.error('POST /profile failed:', err)
    res.status(500).json({ error: 'Failed to save profile' })
  }
})

// POST /weigh-in — update today's weight only (keeps a history for the trend).
app.post('/weigh-in', async (req, res) => {
  const { weight_kg } = req.body ?? {}
  if (!weight_kg) return res.status(400).json({ error: 'weight is required' })
  try {
    const uid = await userIdFromReq(req)
    const upd = await pool.query(
      `UPDATE body_profile SET weight_kg = $2, updated_at = now() WHERE user_id = $1 RETURNING *`,
      [uid, weight_kg],
    )
    if (upd.rowCount === 0) {
      return res.status(400).json({ error: 'Set up your body profile first' })
    }
    await pool.query(`INSERT INTO weight_logs (user_id, weight_kg) VALUES ($1, $2)`, [uid, weight_kg])
    const wl = await pool.query(
      `SELECT weight_kg FROM weight_logs WHERE user_id = $1 ORDER BY created_at ASC`,
      [uid],
    )
    let trend = null
    if (wl.rows.length >= 2) {
      const f = Number(wl.rows[0].weight_kg)
      const l = Number(wl.rows[wl.rows.length - 1].weight_kg)
      trend = +(l - f).toFixed(1)
    }
    res.json({ profile: upd.rows[0], targets: computeTargets(upd.rows[0]), trend })
  } catch (err) {
    console.error('POST /weigh-in failed:', err)
    res.status(500).json({ error: 'Failed to record weight' })
  }
})

app.post('/coach', async (req, res) => {
  try {
    const uid = await userIdFromReq(req)
    const pr = await pool.query(`SELECT * FROM body_profile WHERE user_id = $1`, [uid])
    const p = pr.rows[0]
    if (!p || !p.height_cm || !p.weight_kg) {
      return res.status(400).json({ error: 'Set up your body profile first' })
    }
    const t = computeTargets(p)

    const tot = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'exercise' THEN 0 ELSE calories END), 0) cal,
         COALESCE(SUM(CASE WHEN kind = 'exercise' THEN 0 ELSE protein END), 0) pro,
         COALESCE(SUM(CASE WHEN kind = 'exercise' THEN calories ELSE 0 END), 0) burned
       FROM food_logs WHERE created_at::date = current_date AND user_id = $1`,
      [uid],
    )
    const loggedCal = Number(tot.rows[0].cal)
    const loggedPro = Number(tot.rows[0].pro)
    const burnedCal = Number(tot.rows[0].burned)
    const netCal = loggedCal - burnedCal

    const todayFoods = await pool.query(
      `SELECT food_description, calories, protein, kind FROM food_logs
       WHERE created_at::date = current_date AND user_id = $1 ORDER BY created_at`,
      [uid],
    )
    const foodList =
      todayFoods.rows
        .map((r) =>
          r.kind === 'exercise'
            ? `- 🏋️ ${r.food_description} (burned ${r.calories ?? '?'} cal)`
            : `- ${r.food_description} (${r.calories ?? '?'} cal, ${r.protein ?? '?'}g protein)`,
        )
        .join('\n') || '(nothing logged yet)'

    const context =
      `USER PROFILE: height ${p.height_cm} cm, weight ${p.weight_kg} kg, age ${p.age || 'unknown'}, ` +
      `sex ${p.sex || 'unspecified'}, activity ${p.activity}, goal ${p.goal} weight.\n` +
      `DAILY TARGETS: ${t.calorieTarget} cal, ${t.proteinTarget}g protein. BMI ${t.bmi}.\n` +
      `TODAY SO FAR: ate ${loggedCal} cal, burned ${burnedCal} cal through exercise, net ${netCal} cal, ${loggedPro}g protein ` +
      `(net leaves ${Math.max(0, t.calorieTarget - netCal)} cal toward target).\n` +
      `TODAY'S LOG:\n${foodList}`

    const message = (req.body?.message || '').trim()
    const userTurn = message
      ? `${context}\n\nUSER MESSAGE: ${message}`
      : `${context}\n\nGive me coaching for the rest of the day.`

    const raw = await callGemini({ text: userTurn, system: COACH_PROMPT, maxTokens: 400 })

    // If the coach chose to log a food OR an exercise, insert it and return the new entry.
    const action = tryParseAction(raw)
    if (action && action.action === 'log' && action.food) {
      const isEx = action.kind === 'exercise'
      const cal = Number.isFinite(Number(action.calories)) ? Math.round(Number(action.calories)) : null
      const pro = !isEx && Number.isFinite(Number(action.protein)) ? Math.round(Number(action.protein)) : null
      const reply = action.reply || (isEx ? `Logged ${action.food}.` : `Added “${action.food}” to your log.`)
      const { rows } = await pool.query(
        `INSERT INTO food_logs (user_id, food_description, calories, protein, ai_response, kind)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [uid, action.food, cal, pro, reply, isEx ? 'exercise' : 'food'],
      )
      return res.json({ advice: reply, entry: rows[0] })
    }

    res.json({ advice: raw })
  } catch (err) {
    console.error('POST /coach failed:', err)
    res.status(500).json({ error: 'Failed to get coaching' })
  }
})

// POST /plan — AI builds a full-day meal plan from the user's profile + targets.
app.post('/plan', async (req, res) => {
  try {
    const uid = await userIdFromReq(req)
    const pr = await pool.query(`SELECT * FROM body_profile WHERE user_id = $1`, [uid])
    const p = pr.rows[0]
    if (!p || !p.height_cm || !p.weight_kg) {
      return res.status(400).json({ error: 'Set up your body profile first' })
    }
    const t = computeTargets(p)
    const prompt =
      `My profile: height ${p.height_cm} cm, weight ${p.weight_kg} kg, age ${p.age || 'unknown'}, ` +
      `sex ${p.sex || 'unspecified'}, activity ${p.activity}, goal ${p.goal} weight. ` +
      `Daily targets ~${t.calorieTarget} cal and ${t.proteinTarget} g protein. Make me a full day plan.`
    const raw = await callGemini({ text: prompt, system: PLAN_PROMPT, maxTokens: 800 })

    const parsed = extractJson(raw)
    let items = []
    if (parsed && Array.isArray(parsed.items)) {
      items = parsed.items
        .map((it) => ({
          label: String(it.label || '').trim(),
          kind: it.kind === 'exercise' ? 'exercise' : 'food',
          calories: Number.isFinite(Number(it.calories)) ? Math.round(Number(it.calories)) : null,
          protein: Number.isFinite(Number(it.protein)) ? Math.round(Number(it.protein)) : null,
        }))
        .filter((it) => it.label)
    }
    const plan = items.length
      ? items
          .map((it) =>
            it.kind === 'exercise'
              ? `• ${it.label} (~${it.calories ?? '?'} cal burned)`
              : `• ${it.label} (~${it.calories ?? '?'} cal · ${it.protein ?? '?'}g protein)`,
          )
          .join('\n') + (parsed?.note ? `\n\n${parsed.note}` : '')
      : raw
    res.json({ plan, items, targets: t })
  } catch (err) {
    console.error('POST /plan failed:', err)
    res.status(500).json({ error: 'Failed to make a plan' })
  }
})

// POST /body-scan — AI feedback on a body photo (general, supportive — no measurements).
app.post('/body-scan', async (req, res) => {
  const { file } = req.body ?? {}
  if (!file?.data || !file?.media_type) {
    return res.status(400).json({ error: 'A photo is required' })
  }
  try {
    const uid = await userIdFromReq(req)
    const pr = await pool.query(`SELECT * FROM body_profile WHERE user_id = $1`, [uid])
    const p = pr.rows[0]

    const wl = await pool.query(
      `SELECT weight_kg FROM weight_logs WHERE user_id = $1 ORDER BY created_at ASC`,
      [uid],
    )
    let history = 'No tracked weigh-in history yet.'
    if (wl.rows.length >= 2) {
      const first = Number(wl.rows[0].weight_kg)
      const last = Number(wl.rows[wl.rows.length - 1].weight_kg)
      const change = +(last - first).toFixed(1)
      history = `Tracked weight: started ${first} kg, now ${last} kg — ${change <= 0 ? 'down' : 'up'} ${Math.abs(change)} kg across ${wl.rows.length} weigh-ins.`
    } else if (p?.weight_kg) {
      history = `Current logged weight: ${p.weight_kg} kg. Only one weigh-in so far — no change to compare yet.`
    }

    const ctx = p
      ? `My goal: ${p.goal} weight. Profile height: ${p.height_cm} cm, current weight: ${p.weight_kg} kg. ${history}`
      : 'I have not set a profile yet.'

    const analysis = await callGemini({
      text: `${ctx}\n\nHere is a photo of me — estimate my weight range and build, tell me my tracked weight change, comment on height, and advise toward my goal.`,
      file,
      system: BODY_PROMPT,
    })
    res.json({ analysis })
  } catch (err) {
    console.error('POST /body-scan failed:', err)
    res.status(500).json({ error: 'Failed to analyze the photo' })
  }
})

// SPA fallback: any other GET serves the React app (must be after the API routes).
if (hasDist) {
  app.use((req, res) => {
    if (req.method === 'GET') res.sendFile(path.join(distPath, 'index.html'))
    else res.status(404).json({ error: 'Not found' })
  })
}

const PORT = process.env.PORT || 3001

initDb()
  .then(() => {
    if (!GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY is not set — meals will fail until you add it to server/.env')
    }
    app.listen(PORT, () =>
      console.log(`BodyMind API running on http://localhost:${PORT} (model: ${GEMINI_MODEL})`),
    )
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  })
