import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import {
  Mic,
  Loader2,
  Send,
  Camera,
  Flame,
  Dumbbell,
  Trash2,
  User,
  Sparkles,
  X,
  TrendingDown,
  TrendingUp,
  Target,
  LogOut,
  Scale,
  Download,
  ScanLine,
  Smartphone,
  ArrowUpDown,
  ClipboardList,
  Plus,
  Check,
  Activity,
  Utensils,
} from 'lucide-react'
import {
  getLogs,
  createLog,
  clearLogs,
  getProfile,
  updateProfile,
  getCoaching,
  getPlan,
  bodyScan,
  weighIn,
  signup,
  login,
  logout,
  me,
} from './lib/api'

const WebGLShader = lazy(() => import('./WebGLShader').then((m) => ({ default: m.WebGLShader })))

const KG_PER_LB = 0.453592
const GOAL_LABEL = { lose: 'Lose weight', maintain: 'Maintain', gain: 'Gain weight' }

// Coach customization presets.
const COACH_COLORS = {
  emerald: { body: 'var(--cc-body)', shade: 'var(--cc-shade)', dark: 'var(--cc-dark)', knuckle: 'var(--cc-knuckle)' },
  blue: { body: '#4f8ad6', shade: '#3a6fb0', dark: '#2c578c', knuckle: '#3a6fb0' },
  violet: { body: '#9d7bd8', shade: '#7e5fc0', dark: '#634aa0', knuckle: '#7e5fc0' },
  red: { body: '#d76f6f', shade: '#bd5252', dark: '#9c4040', knuckle: '#bd5252' },
  orange: { body: '#e0954a', shade: '#c47a2f', dark: '#a36322', knuckle: '#c47a2f' },
  slate: { body: '#8a98a8', shade: '#6e7d8d', dark: '#566472', knuckle: '#6e7d8d' },
  pink: { body: '#e07ba6', shade: '#c45f8a', dark: '#a3486e', knuckle: '#c45f8a' },
}
const COACH_ACCESSORIES = ['none', 'cap', 'headband', 'shades', 'chain']
const COACH_BUILDS = ['slim', 'normal', 'buff', 'round']
const DEFAULT_COACH_STYLE = { color: 'emerald', accessory: 'none', build: 'buff' }

// Coach's fixed strength. Stay consistent (~a year of daily wins + feeding) to pass it.
const COACH_STRENGTH = 300
// Shop — buy with coins (earned by logging), then feed the coach or "You".
const SHOP = [
  { id: 'fruit', name: 'Fruit', emoji: '🍎', cost: 5, xp: 2, react: 'Yum! 😋' },
  { id: 'salad', name: 'Salad', emoji: '🥗', cost: 8, xp: 3, react: 'So fresh 😎' },
  { id: 'shake', name: 'Protein Shake', emoji: '🥤', cost: 12, xp: 4, react: 'Gains incoming 💪' },
  { id: 'powder', name: 'Protein Powder', emoji: '🥛', cost: 20, xp: 6, react: 'LESSGOO 🔥' },
  { id: 'egg', name: 'Eggs', emoji: '🥚', cost: 7, xp: 3, react: 'Thank you 🙏' },
  { id: 'burger', name: 'Big Mac', emoji: '🍔', cost: 6, xp: -4, react: 'Ugh… junk 🤢' },
  { id: 'fries', name: 'Fries', emoji: '🍟', cost: 4, xp: -3, react: 'that’s mid 💀' },
  { id: 'soda', name: 'Soda', emoji: '🥤', cost: 3, xp: -3, react: 'so much sugar 😵' },
]

function loadCoachStyle() {
  try {
    return { ...DEFAULT_COACH_STYLE, ...(JSON.parse(localStorage.getItem('bodymind_coach_style')) || {}) }
  } catch {
    return { ...DEFAULT_COACH_STYLE }
  }
}

function localKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toEntry(row) {
  return {
    id: row.id,
    ts: row.created_at,
    time: new Date(row.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    transcript: row.food_description,
    reply: row.ai_response,
    calories: row.calories,
    protein: row.protein,
    kind: row.kind || 'food',
  }
}

let _cid = 0
function newId() {
  _cid += 1
  return `c${_cid}_${_cid * 7 + 13}`
}

function App() {
  // Meals / voice
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState(false)
  const [micError, setMicError] = useState('')
  const [notice, setNotice] = useState('') // "not food" message
  const [clarify, setClarify] = useState(null) // { question, options } when ambiguous
  const [nutrition, setNutrition] = useState(null)
  const [log, setLog] = useState([])
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [logKind, setLogKind] = useState('food') // middle panel: log food or exercise

  // Body / coach
  const [profile, setProfile] = useState(null)
  const [targets, setTargets] = useState({})
  const [trend, setTrend] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [showCoach, setShowCoach] = useState(false)
  const [coachMessages, setCoachMessages] = useState([])
  const [coachInput, setCoachInput] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const [showBody, setShowBody] = useState(false)
  const [bodyLoading, setBodyLoading] = useState(false)
  const [bodyAnalysis, setBodyAnalysis] = useState('')
  const [showScanGuide, setShowScanGuide] = useState(false)
  const [isMobile] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches) ||
        false),
  )
  // True when running as the installed app (PWA standalone) — hide "download" prompts then.
  const [isStandalone] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.navigator?.standalone === true),
  )
  const [showWelcome, setShowWelcome] = useState(true) // intro splash before sign-in
  const [coachMode, setCoachMode] = useState('walk') // mascot: walk | pushup | pullup | lift
  const [nearCoach, setNearCoach] = useState(false) // cursor close → he swings the dumbbell
  const [coachStyle, setCoachStyle] = useState(loadCoachStyle) // color / accessory / build
  const [showCustomize, setShowCustomize] = useState(false)
  const [playEmote, setPlayEmote] = useState(false) // the two characters "play" together
  const [showShop, setShowShop] = useState(false)
  const [coinsSpent, setCoinsSpent] = useState(() => Number(localStorage.getItem('bodymind_coins_spent')) || 0)
  const [youXP, setYouXP] = useState(() => Number(localStorage.getItem('bodymind_you_xp')) || 0) // long-term strength
  const [xpDate, setXpDate] = useState(() => localStorage.getItem('bodymind_xp_date') || '')
  const [feed, setFeed] = useState(null) // { who: 'you'|'coach', text } — speech bubble
  const fullRef = useRef({ count: 0, last: 0 })
  const prevLogLen = useRef(0)
  const [showWeigh, setShowWeigh] = useState(false)
  const [weighInput, setWeighInput] = useState('')
  const [showPlan, setShowPlan] = useState(false)
  const [planLoading, setPlanLoading] = useState(false)
  const [planText, setPlanText] = useState('')
  // Today's checklist (plan items + your own tasks). Ticking one logs it.
  const [checklist, setChecklist] = useState(() => {
    try {
      const d = new Date()
      const k = `bodymind_checklist_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return JSON.parse(localStorage.getItem(k)) || []
    } catch {
      return []
    }
  })
  const [mealInput, setMealInput] = useState('')
  const [exInput, setExInput] = useState('')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    unit: 'imperial', ft: '', inch: '', cm: '', weight: '', age: '', sex: '', goal: 'lose', activity: 'medium',
  })

  // Auth
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authMode, setAuthMode] = useState('signup')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const recognitionRef = useRef(null)
  const topEntryRef = useRef(null)
  const fileInputRef = useRef(null)
  const bodyFileRef = useRef(null)
  const coachEndRef = useRef(null)
  const coachRef = useRef(null)
  const dragRef = useRef({ down: false, moved: false, sx: 0, sy: 0, lastX: 0, lastY: 0, lastT: 0 })
  const physRef = useRef({ x: 16, y: 0, vx: 0, vy: 0, mode: 'walk', dir: 1, dragging: false, frozen: false, init: false })

  // ── Speech recognition setup ──
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += chunk
        else interim += chunk
      }
      if (interim) setInterimTranscript(interim)
      if (finalText) {
        setInterimTranscript(finalText)
        setTranscript(finalText)
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicError('Microphone blocked — allow mic access, then reload.')
      } else if (event.error === 'no-speech') {
        setMicError("Didn't catch anything — tap and speak again.")
      } else {
        setMicError(`Mic error: ${event.error}`)
      }
    }
    recognitionRef.current = recognition
    return () => {
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      recognition.abort()
    }
  }, [])

  // ── On mount: check login, then load that user's data ──
  const loadUserData = async () => {
    try {
      const rows = await getLogs()
      setLog(rows.map(toEntry))
    } catch (e) {
      console.error(e)
    }
    try {
      const data = await getProfile()
      if (data.profile) {
        setProfile(data.profile)
        setTargets(data.targets || {})
        setTrend(data.trend)
        return true
      }
    } catch (e) {
      console.error(e)
    }
    return false
  }

  useEffect(() => {
    me()
      .then(async (d) => {
        setUser(d.email)
        await loadUserData()
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link from the download page: /?mode=signup or /?mode=login (skip the splash)
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('mode')
    if (m === 'login' || m === 'signup') {
      setAuthMode(m)
      setShowWelcome(false)
    }
  }, [])

  // Keep the coach chat scrolled to the latest message.
  useEffect(() => {
    coachEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [coachMessages, coachLoading])

  // Mascot randomly switches between roaming and doing workout moves.
  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.random()
      setCoachMode(r < 0.5 ? 'walk' : r < 0.67 ? 'pushup' : r < 0.84 ? 'pullup' : 'lift')
    }, 4500)
    return () => clearInterval(id)
  }, [])

  // Meal plan is made on demand (tap "Plan") so opening the app never burns an
  // AI call or shows an error — it just opens instantly.

  // Hourly reminders to move / hydrate (while logged in and the app is open).
  useEffect(() => {
    if (!user) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    const msgs = [
      '💧 Hydrate! Time to drink some water.',
      '💪 Move break — do a quick set: pushups, squats, or a short walk.',
    ]
    let i = 0
    const fire = () => {
      const msg = msgs[i % msgs.length]
      i++
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('BodyMind', { body: msg, icon: '/icon-192.png' })
        } catch {
          /* ignore */
        }
      }
      setToast(msg)
      setTimeout(() => setToast(''), 7000)
    }
    const id = setInterval(fire, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [user])

  // ── Submit a meal (voice / text / photo) ──
  const submitMeal = async (payload) => {
    setLoading(true)
    setError(false)
    setReply('')
    setNotice('')
    setClarify(null)
    setNutrition(null)
    try {
      const row = await createLog(payload)
      if (row.notFood || row.notExercise) {
        setNotice(row.message)
        return
      }
      if (row.clarify) {
        const q = row.question && !row.question.includes('...') ? row.question : 'Which one did you mean?'
        setClarify({ question: q, options: row.options || [] })
        return
      }
      setReply(row.ai_response)
      const isEx = row.kind === 'exercise'
      setNutrition(
        row.calories != null
          ? { calories: row.calories, protein: isEx ? null : row.protein, kind: row.kind || 'food' }
          : null,
      )
      setLog((prev) => [toEntry(row), ...prev])
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (transcript) submitMeal({ food_description: transcript, kind: logKind })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript])

  const handleTextSubmit = (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setText('')
    submitMeal({ food_description: trimmed, kind: logKind })
  }

  // User picked one of the "did you mean…" options → log that.
  const handleClarifyChoice = (opt) => {
    setClarify(null)
    submitMeal({ food_description: opt, kind: logKind })
  }

  const processFile = (file) => {
    if (!file || loading) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1]
      const note = text.trim()
      setText('')
      submitMeal({ food_description: note || undefined, file: { media_type: file.type, data: base64 } })
    }
    reader.readAsDataURL(file)
  }
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    processFile(file)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files?.[0])
  }

  const handleClick = () => {
    const recognition = recognitionRef.current
    if (!recognition || loading) return
    if (listening) {
      recognition.stop()
      return
    }
    setReply('')
    setError(false)
    setNotice('')
    setClarify(null)
    setNutrition(null)
    setInterimTranscript('')
    setMicError('')
    setListening(true)
    try {
      recognition.start()
    } catch (err) {
      console.error(err)
      setListening(false)
    }
  }

  // ── Auth ──
  const handleAuth = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      const fn = authMode === 'signup' ? signup : login
      const data = await fn(authForm.email.trim(), authForm.password)
      setUser(data.email)
      setAuthForm({ email: '', password: '' })
      await loadUserData() // missing profile → the required-setup screen handles it
    } catch (err) {
      setAuthError(err.message || 'Something went wrong')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout().catch(() => {})
    setUser(null)
    setLog([])
    setProfile(null)
    setTargets({})
    setTrend(null)
  }

  // ── Profile ──
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const openProfile = () => {
    setProfileError('')
    if (profile) {
      const cm = profile.height_cm ? Number(profile.height_cm) : 0
      const kg = profile.weight_kg ? Number(profile.weight_kg) : 0
      if (form.unit === 'imperial') {
        const totalIn = cm ? cm / 2.54 : 0
        setForm((f) => ({
          ...f,
          ft: cm ? String(Math.floor(totalIn / 12)) : '',
          inch: cm ? String(Math.round(totalIn % 12)) : '',
          cm: '',
          weight: kg ? String(Math.round(kg / KG_PER_LB)) : '',
          age: profile.age ? String(profile.age) : '',
          sex: profile.sex || '',
          goal: profile.goal || 'lose',
          activity: profile.activity || 'medium',
        }))
      } else {
        setForm((f) => ({
          ...f,
          cm: cm ? String(Math.round(cm)) : '',
          ft: '', inch: '',
          weight: kg ? String(Math.round(kg)) : '',
          age: profile.age ? String(profile.age) : '',
          sex: profile.sex || '',
          goal: profile.goal || 'lose',
          activity: profile.activity || 'medium',
        }))
      }
    }
    setShowProfile(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSaving(true)
    try {
      let height_cm = null
      let weight_kg = null
      if (form.unit === 'imperial') {
        const ft = Number(form.ft) || 0
        const inch = Number(form.inch) || 0
        if (ft || inch) height_cm = +(((ft * 12) + inch) * 2.54).toFixed(1)
        if (form.weight) weight_kg = +(Number(form.weight) * KG_PER_LB).toFixed(1)
      } else {
        if (form.cm) height_cm = Number(form.cm)
        if (form.weight) weight_kg = Number(form.weight)
      }
      // The AI needs height + weight to compute targets — require them.
      if (!height_cm || !weight_kg) {
        setProfileError('Please enter your height and weight.')
        setProfileSaving(false)
        return
      }
      const payload = {
        height_cm,
        weight_kg,
        age: form.age ? Number(form.age) : null,
        sex: form.sex || null,
        goal: form.goal,
        activity: form.activity,
      }
      const data = await updateProfile(payload)
      // Confirm the save actually persisted before closing.
      if (!data || !data.profile) throw new Error('Save did not confirm — try again')
      setProfile(data.profile)
      setTargets(data.targets || {})
      const fresh = await getProfile().catch(() => null)
      if (fresh) setTrend(fresh.trend)
      setShowProfile(false) // close only after a confirmed save
    } catch (err) {
      setProfileError(err.message || 'Could not save — try again')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleWeighIn = async () => {
    const val = Number(weighInput)
    if (!val) return
    const kg = form.unit === 'imperial' ? +(val * KG_PER_LB).toFixed(1) : val
    try {
      const data = await weighIn(kg)
      setProfile(data.profile)
      setTargets(data.targets || {})
      setTrend(data.trend)
      setShowWeigh(false)
      setWeighInput('')
    } catch (err) {
      console.error(err)
    }
  }

  // Build today's plan with the AI and drop it straight into the checklist.
  const openPlan = async (force) => {
    if (planLoading) return
    if (!force && checklist.some((i) => i.fromPlan)) {
      setToast('Your plan is already in the checklist ✓')
      setTimeout(() => setToast(''), 3500)
      return
    }
    setPlanLoading(true)
    try {
      const data = await getPlan()
      if (Array.isArray(data.items) && data.items.length) {
        const items = data.items.map((it) => ({
          id: newId(),
          label: it.label,
          kind: it.kind === 'exercise' ? 'exercise' : 'food',
          calories: it.calories ?? null,
          protein: it.protein ?? null,
          done: false,
          fromPlan: true,
        }))
        // Keep anything you ticked or added yourself; refresh the plan items.
        setChecklist((prev) => [...prev.filter((i) => i.done || !i.fromPlan), ...items])
        setToast("Today's plan added to your checklist ✓")
      } else {
        setToast('Got a plan, but couldn’t split it into tasks — try again.')
      }
      setTimeout(() => setToast(''), 4000)
    } catch (err) {
      console.error(err)
      const m = err.message || ''
      const msg = /429|quota|exhaust|limit|rate/i.test(m)
        ? 'Daily AI limit reached — try again later.'
        : /profile/i.test(m)
          ? 'Your profile didn’t load — log out and back in, then try Auto-plan again.'
          : m || 'Could not build a plan — try again.'
      setToast(msg)
      setTimeout(() => setToast(''), 6000)
    } finally {
      setPlanLoading(false)
    }
  }

  // Persist today's checklist locally.
  useEffect(() => {
    try {
      localStorage.setItem(`bodymind_checklist_${localKey(new Date())}`, JSON.stringify(checklist))
    } catch {
      /* ignore */
    }
  }, [checklist])

  // Persist coach customization.
  useEffect(() => {
    try {
      localStorage.setItem('bodymind_coach_style', JSON.stringify(coachStyle))
    } catch {
      /* ignore */
    }
  }, [coachStyle])

  // Every so often the coach and "You" play together (a little emote).
  useEffect(() => {
    const id = setInterval(() => {
      setPlayEmote(true)
      setTimeout(() => setPlayEmote(false), 2600)
    }, 11000)
    return () => clearInterval(id)
  }, [])

  // Persist shop coins spent + long-term strength.
  useEffect(() => {
    try { localStorage.setItem('bodymind_coins_spent', String(coinsSpent)) } catch { /* ignore */ }
  }, [coinsSpent])
  useEffect(() => {
    try { localStorage.setItem('bodymind_you_xp', String(youXP)) } catch { /* ignore */ }
  }, [youXP])
  useEffect(() => {
    try { localStorage.setItem('bodymind_xp_date', xpDate) } catch { /* ignore */ }
  }, [xpDate])

  const addItem = (kind, label, clear) => {
    const t = (label || '').trim()
    if (!t) return
    setChecklist((prev) => [...prev, { id: newId(), label: t, kind, calories: null, protein: null, done: false }])
    clear('')
  }
  const removeChecklistItem = (id) => setChecklist((prev) => prev.filter((i) => i.id !== id))

  // Tick an item → log it (instant if it already has an estimate, else AI estimates it).
  const toggleChecklistItem = async (item) => {
    if (item.done || item.logging) return
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, logging: true } : i)))
    try {
      const payload =
        item.calories != null
          ? { food_description: item.label, calories: item.calories, protein: item.protein ?? null, kind: item.kind, prelogged: true }
          : { food_description: item.label, kind: item.kind }
      const row = await createLog(payload)
      if (row.notFood || row.notExercise || row.clarify) {
        setToast(row.message || row.question || 'Could not log that — edit it and try again.')
        setTimeout(() => setToast(''), 5000)
        setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, logging: false } : i)))
        return
      }
      setLog((prev) => [toEntry(row), ...prev])
      setChecklist((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, done: true, logging: false, kind: row.kind || i.kind, calories: row.calories ?? i.calories, protein: row.protein ?? i.protein }
            : i,
        ),
      )
    } catch (err) {
      console.error(err)
      setToast('Could not log that — try again.')
      setTimeout(() => setToast(''), 4000)
      setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, logging: false } : i)))
    }
  }

  const renderChecklistItem = (item) => (
    <div
      key={item.id}
      className={`group flex items-start gap-2.5 rounded-xl border p-2.5 transition-colors ${
        item.done ? 'border-white/5 bg-[#0f131a]/60' : 'border-white/10 bg-[#12151b] hover:border-green-600/40'
      }`}
    >
      <button
        type="button"
        onClick={() => toggleChecklistItem(item)}
        disabled={item.done || item.logging}
        aria-label={item.done ? 'Logged' : 'Tick to log'}
        className={`mt-0.5 shrink-0 h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
          item.done ? 'bg-green-500 border-green-500' : 'border-white/25 hover:border-green-400'
        }`}
      >
        {item.logging ? (
          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
        ) : item.done ? (
          <Check className="h-3.5 w-3.5 text-[#08090a]" strokeWidth={3} />
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <span className={`text-sm leading-snug ${item.done ? 'text-gray-500 line-through' : 'text-white'}`}>{item.label}</span>
        {item.calories != null ? (
          <div className="mt-1 text-[11px] text-gray-500">
            {item.kind === 'exercise'
              ? `≈ ${item.calories} cal burned`
              : `≈ ${item.calories} cal${item.protein != null ? ` · ${item.protein}g protein` : ''}`}
          </div>
        ) : (
          !item.done && <div className="mt-1 text-[11px] text-gray-600">tap the box to estimate &amp; log</div>
        )}
        {item.done && <div className="mt-0.5 text-[11px] text-green-400">Logged ✓</div>}
      </div>
      <button
        type="button"
        onClick={() => removeChecklistItem(item.id)}
        aria-label="Remove"
        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )

  const runCoach = () => {
    setShowCoach(true)
    if (coachMessages.length === 0) {
      setCoachMessages([
        {
          role: 'coach',
          text: "Yo wassup gng 💪 it's Coach Remy. Hit me — meal ideas, your numbers today, or just tell me to log somethin' (like “log a banana”). Let's lock in fr 🔥",
        },
      ])
    }
  }

  // ── Roaming mascot: he walks on his own; grab + fling him to throw him. ──
  const MC_W = 126
  const MC_H = 178
  const groundY = () => window.innerHeight - MC_H - 10

  const onMascotDown = (e) => {
    const p = physRef.current
    p.dragging = true
    p.mode = 'walk'
    p.vx = 0
    p.vy = 0
    dragRef.current = {
      down: true,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMascotMove = (e) => {
    const d = dragRef.current
    if (!d.down) return
    if (Math.abs(e.clientX - d.sx) > 4 || Math.abs(e.clientY - d.sy) > 4) d.moved = true
    if (!d.moved) return
    const p = physRef.current
    p.x = Math.max(6, Math.min(window.innerWidth - MC_W - 6, e.clientX - MC_W / 2))
    p.y = Math.max(6, Math.min(window.innerHeight - MC_H - 6, e.clientY - MC_H / 2))
    // Track the flick speed, weighted toward the most recent motion so a quick
    // flick actually registers as a throw (not a limp drop).
    const now = performance.now()
    const dt = Math.max(8, now - d.lastT)
    const nvx = ((e.clientX - d.lastX) / dt) * 16.6667
    const nvy = ((e.clientY - d.lastY) / dt) * 16.6667
    p.vx = 0.3 * p.vx + 0.7 * nvx
    p.vy = 0.3 * p.vy + 0.7 * nvy
    d.lastX = e.clientX
    d.lastY = e.clientY
    d.lastT = now
    const el = coachRef.current
    if (el) {
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.style.bottom = 'auto'
    }
  }
  const onMascotUp = (e) => {
    const d = dragRef.current
    const wasDrag = d.moved
    d.down = false
    const p = physRef.current
    p.dragging = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (wasDrag) {
      // Throw him with the flick velocity, then gravity takes over. If you paused
      // before letting go (lastT is stale), drop him gently instead of flinging.
      const idle = performance.now() - d.lastT
      const decay = idle > 90 ? 0.25 : 1
      const clamp = (v) => Math.max(-60, Math.min(60, v))
      p.vx = clamp(p.vx * 1.7 * decay)
      p.vy = clamp(p.vy * 1.7 * decay)
      p.mode = 'fly'
      setCoachMode('walk')
      setNearCoach(false)
    } else {
      runCoach()
    }
  }

  // Stop strolling while he's working out or swinging at you.
  useEffect(() => {
    physRef.current.frozen = nearCoach || coachMode !== 'walk'
  }, [nearCoach, coachMode])

  // Physics + walk loop — drives the mascot's position every frame.
  useEffect(() => {
    if (showCoach) return // mascot is hidden while the chat panel is open
    const p = physRef.current
    if (!p.init) {
      p.x = 16
      p.y = groundY()
      p.init = true
    }
    if (p.mode !== 'fly') p.y = Math.min(p.y, groundY())
    let last = performance.now()
    let raf = 0
    const step = (now) => {
      const dt = Math.min(2.5, (now - last) / 16.6667)
      last = now
      // Re-grab the element each frame so the loop survives the button remounting.
      const el = coachRef.current
      if (!el) {
        raf = requestAnimationFrame(step)
        return
      }
      const gY = groundY()
      const maxX = window.innerWidth - MC_W - 6
      if (p.dragging) {
        // position is set directly by the drag handler
      } else if (p.mode === 'fly') {
        p.vy += 0.9 * dt // gravity
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.x < 6) { p.x = 6; p.vx = -p.vx * 0.55 }
        if (p.x > maxX) { p.x = maxX; p.vx = -p.vx * 0.55 }
        if (p.y < 6) { p.y = 6; p.vy = -p.vy * 0.5 }
        if (p.y >= gY) {
          p.y = gY
          if (Math.abs(p.vy) > 2.4) {
            p.vy = -p.vy * 0.5 // bounce
            p.vx *= 0.7
          } else {
            p.vy = 0
            p.vx *= 0.6
            if (Math.abs(p.vx) < 0.5) {
              p.mode = 'walk' // settled → back to strolling
              p.dir = p.vx >= 0 ? 1 : -1
            }
          }
        }
        el.classList.add('rc-falling')
      } else {
        el.classList.remove('rc-falling')
        if (!p.frozen) {
          p.x += p.dir * 0.8 * dt
          if (p.x < 6) { p.x = 6; p.dir = 1 }
          if (p.x > maxX) { p.x = maxX; p.dir = -1 }
        }
        p.y = gY
      }
      el.style.bottom = 'auto'
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCoach])

  // When the cursor gets near the mascot, he swings the dumbbell at you.
  useEffect(() => {
    if (showCoach) return
    const onMove = (e) => {
      const el = coachRef.current
      const p = physRef.current
      if (!el || dragRef.current.down || p.mode === 'fly') {
        setNearCoach(false)
        return
      }
      const r = el.getBoundingClientRect()
      const nx = Math.max(r.left, Math.min(e.clientX, r.right))
      const ny = Math.max(r.top, Math.min(e.clientY, r.bottom))
      const dx = e.clientX - nx
      const dy = e.clientY - ny
      setNearCoach(dx * dx + dy * dy < 75 * 75) // within ~75px of his body
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [showCoach])

  const sendCoachMessage = async (e) => {
    e.preventDefault()
    const msg = coachInput.trim()
    if (!msg || coachLoading) return
    setCoachInput('')
    setCoachMessages((prev) => [...prev, { role: 'user', text: msg }])
    setCoachLoading(true)
    try {
      const data = await getCoaching(msg)
      setCoachMessages((prev) => [...prev, { role: 'coach', text: data.advice }])
      // If the coach logged a meal for you, show it in the log immediately.
      if (data.entry) setLog((prev) => [toEntry(data.entry), ...prev])
    } catch (err) {
      console.error(err)
      const limited = /429|quota|exhaust|limit/i.test(err.message || '')
      setCoachMessages((prev) => [
        ...prev,
        {
          role: 'coach',
          text: limited
            ? "I'm gassed for today 😮‍💨 — hit the free AI daily limit. Try again later and I got you."
            : 'Sorry, I had trouble answering — try again in a sec.',
        },
      ])
    } finally {
      setCoachLoading(false)
    }
  }

  const handleBodyFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1]
      setShowBody(true)
      setBodyLoading(true)
      setBodyAnalysis('')
      try {
        const data = await bodyScan({ media_type: file.type, data: base64 })
        setBodyAnalysis(data.analysis)
      } catch (err) {
        console.error(err)
        setBodyAnalysis('Could not analyze the photo — try again with a clearer, well-lit shot.')
      } finally {
        setBodyLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // Shared profile form fields (used by the required-setup screen and the edit modal).
  const profileFields = () => (
    <>
      <div className="flex gap-1 mb-4 p-1 rounded-full bg-[#12151b] border border-white/10 text-xs">
        {['imperial', 'metric'].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setField('unit', u)}
            className={`flex-1 rounded-full py-1.5 transition-colors ${
              form.unit === u ? 'bg-green-500 text-[#08090a] font-semibold' : 'text-gray-400'
            }`}
          >
            {u === 'imperial' ? 'lb / ft' : 'kg / cm'}
          </button>
        ))}
      </div>

      <label className="text-xs text-gray-400">Height</label>
      {form.unit === 'imperial' ? (
        <div className="flex gap-2 mt-1 mb-3">
          <input type="number" min="0" placeholder="ft" value={form.ft} onChange={(e) => setField('ft', e.target.value)} className="w-1/2 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60" />
          <input type="number" min="0" placeholder="in" value={form.inch} onChange={(e) => setField('inch', e.target.value)} className="w-1/2 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60" />
        </div>
      ) : (
        <input type="number" min="0" placeholder="cm" value={form.cm} onChange={(e) => setField('cm', e.target.value)} className="w-full mt-1 mb-3 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60" />
      )}

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Weight ({form.unit === 'imperial' ? 'lb' : 'kg'})</label>
          <input type="number" min="0" placeholder={form.unit === 'imperial' ? 'lb' : 'kg'} value={form.weight} onChange={(e) => setField('weight', e.target.value)} className="w-full mt-1 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60" />
        </div>
        <div className="w-20">
          <label className="text-xs text-gray-400">Age</label>
          <input type="number" min="0" placeholder="yrs" value={form.age} onChange={(e) => setField('age', e.target.value)} className="w-full mt-1 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60" />
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs text-gray-400">Gender</label>
          <select value={form.sex} onChange={(e) => setField('sex', e.target.value)} style={{ colorScheme: 'dark' }} className="w-full mt-1 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60">
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400">Activity</label>
          <select value={form.activity} onChange={(e) => setField('activity', e.target.value)} style={{ colorScheme: 'dark' }} className="w-full mt-1 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/60">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <label className="text-xs text-gray-400">Goal</label>
      <div className="grid grid-cols-3 gap-2 mt-1 mb-4">
        {['lose', 'maintain', 'gain'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setField('goal', g)}
            className={`rounded-lg py-2 text-xs capitalize transition-colors border ${
              form.goal === g
                ? 'bg-green-500 text-[#08090a] border-green-500 font-semibold'
                : 'bg-[#12151b] text-gray-300 border-white/10 hover:border-green-500/40'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    </>
  )

  // ── Derived: group log by day, today totals, streak ──
  const todayKey = localKey(new Date())
  const yd = new Date(); yd.setDate(yd.getDate() - 1)
  const yestKey = localKey(yd)
  const dayMap = new Map()
  for (const e of log) {
    const k = localKey(new Date(e.ts))
    if (!dayMap.has(k)) dayMap.set(k, { key: k, entries: [], cal: 0, pro: 0, burned: 0 })
    const g = dayMap.get(k)
    g.entries.push(e)
    if (e.kind === 'exercise') g.burned += e.calories || 0
    else {
      g.cal += e.calories || 0
      g.pro += e.protein || 0
    }
  }
  const days = [...dayMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
  const dayLabel = (k) =>
    k === todayKey ? 'Today' : k === yestKey ? 'Yesterday' : new Date(k + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const todayGroup = dayMap.get(todayKey)
  const totalCalories = todayGroup?.cal || 0 // eaten
  const totalProtein = todayGroup?.pro || 0
  const totalBurned = todayGroup?.burned || 0
  const netCalories = totalCalories - totalBurned
  let streak = 0
  {
    const keys = new Set(dayMap.keys())
    let cur = new Date()
    if (!keys.has(localKey(cur))) cur.setDate(cur.getDate() - 1)
    while (keys.has(localKey(cur))) {
      streak++
      cur.setDate(cur.getDate() - 1)
    }
  }

  const hasTargets = profile && targets.calorieTarget
  const profileComplete = profile && profile.height_cm && profile.weight_kg
  const remaining = hasTargets ? Math.max(0, targets.calorieTarget - netCalories) : 0
  const calPct = hasTargets ? Math.min(100, Math.max(0, Math.round((netCalories / targets.calorieTarget) * 100))) : 0
  const proPct = hasTargets && targets.proteinTarget ? Math.min(100, Math.round((totalProtein / targets.proteinTarget) * 100)) : 0
  // How far OVER each goal you are (0 if still under). Calories over = bad, protein over = good.
  const calOver = hasTargets ? Math.max(0, netCalories - targets.calorieTarget) : 0
  const proOver = hasTargets && targets.proteinTarget ? Math.max(0, totalProtein - targets.proteinTarget) : 0

  // Coins: earned by logging meals + your streak; spent in the shop.
  const coinsEarned = log.length * 5 + streak * 8
  const coins = Math.max(0, coinsEarned - coinsSpent)

  // "You" strength = long-term XP (daily consistency + feeding), nudged by recent food.
  const gains = log.slice(0, 20).reduce((s, e) => {
    if (e.kind === 'exercise') return s + (e.calories || 0) / 25 // workouts make you stronger
    return s + ((e.protein || 0) - (e.calories || 0) / 22) // food: protein good, big calories bad
  }, 0)
  const youStrength = Math.round(youXP + Math.max(-25, Math.min(45, gains)))
  const strongerThanCoach = youStrength >= COACH_STRENGTH
  // Continuous bulk 0→1.3 so muscle grows gradually (not in snaps) as strength builds.
  const bulk = Math.max(0, Math.min(1.3, (youStrength + 12) / 100))
  // Starting fatness comes from your real body (BMI): heavy profile → starts fat.
  // Recent junk adds belly; building strength/muscle leans you out over time.
  const bmi = (targets && targets.bmi) || 22
  const fatFromBmi = Math.max(0, Math.min(1.5, (bmi - 21) / 11))
  const softness = Math.max(0, Math.min(1.7, fatFromBmi + Math.max(0, -gains) / 35 - bulk * 0.55))
  const youMood = strongerThanCoach
    ? 'STRONGER THAN COACH 👑'
    : softness > 0.95
      ? 'gotta slim down 🍔'
      : softness > 0.5
        ? 'eat cleaner 😅'
        : bulk > 0.75
          ? 'getting jacked 🔥'
          : bulk > 0.35
            ? 'gaining muscle 💪'
            : "let's get gains"
  const mealItems = checklist.filter((i) => i.kind === 'food')
  const exItems = checklist.filter((i) => i.kind === 'exercise')
  const weightLb = profile?.weight_kg ? Math.round(Number(profile.weight_kg) / KG_PER_LB) : null
  const trendLb = trend != null ? Math.round(trend / KG_PER_LB) : null

  // Feed an item to the coach or "You": spend coins, react, and (for You) change strength.
  const feedCharacter = (item, who) => {
    if (coins < item.cost) {
      setFeed({ who, text: 'need more coins 💰' })
      setTimeout(() => setFeed(null), 1800)
      return
    }
    setCoinsSpent((c) => c + item.cost)
    if (who === 'you') setYouXP((x) => Math.max(0, Math.round(x + item.xp)))
    const now = Date.now()
    const f = fullRef.current
    f.count = now - f.last < 5000 ? f.count + 1 : 1
    f.last = now
    setFeed({ who, text: f.count >= 4 ? "I'm full 😅" : item.react })
    setTimeout(() => setFeed(null), 2400)
  }

  // React on the "You" character every time you log a real food.
  useEffect(() => {
    if (log.length > prevLogLen.current && prevLogLen.current !== 0) {
      const newest = log[0]
      if (newest && newest.kind !== 'exercise') {
        const good = (newest.protein || 0) - (newest.calories || 0) / 22 > 0
        setFeed({ who: 'you', text: good ? 'gains 💪' : 'oof 🍔' })
        setTimeout(() => setFeed(null), 2000)
      }
    }
    prevLogLen.current = log.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.length])

  // A consistent day → permanent strength. Stay on track and you'll pass the coach.
  useEffect(() => {
    if (!hasTargets || !todayGroup || xpDate === todayKey) return
    const hitProtein = targets.proteinTarget && totalProtein >= targets.proteinTarget
    const goodDay = todayGroup.entries.filter((e) => e.kind !== 'exercise').length >= 3
    if (hitProtein || goodDay) {
      setYouXP((x) => x + 1)
      setXpDate(todayKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalProtein, todayGroup, xpDate, todayKey, hasTargets])

  // ── Welcome / intro splash (before sign-in) ──
  if (authChecked && !user && showWelcome) {
    const features = [
      { icon: Mic, title: 'Log by voice', sub: 'Just say what you ate' },
      { icon: Sparkles, title: 'AI coach', sub: 'Chat & get a personal plan' },
      { icon: Flame, title: 'Daily streak', sub: 'Build the habit, day by day' },
      { icon: ScanLine, title: 'Body scan', sub: 'Track your progress' },
    ]
    return (
      <div
        className="relative min-h-[100svh] flex flex-col items-center justify-center px-6 text-white text-center overflow-hidden bg-black"
        style={{
          colorScheme: 'dark',
          paddingTop: 'max(2rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        }}
      >
        <Suspense fallback={null}>
          <WebGLShader />
        </Suspense>
        {/* darken the shader so text stays readable */}
        <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 50% at 50% 50%, transparent 30%, rgba(0,0,0,0.55) 100%)' }} />
        <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
          <div className="mb-5 h-20 w-20 rounded-[1.4rem] bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-[0_18px_44px_-16px_rgba(47,158,110,0.5)] ring-1 ring-white/10 animate-fade-in">
            <Mic className="h-10 w-10 text-white" strokeWidth={1.7} />
          </div>
          <h1 className="font-display text-5xl font-semibold tracking-tight text-brand animate-fade-in">BodyMind</h1>
          <p className="text-gray-400 mt-2 text-[15px] leading-relaxed max-w-xs animate-fade-in">
            Your voice-first nutrition coach. Log meals in a sentence — get instant calories, protein &amp; AI guidance.
          </p>

          <div className="w-full mt-7 grid grid-cols-2 gap-2.5">
            {features.map((f, i) => (
              <div
                key={i}
                className="card-hover rounded-2xl border border-white/10 bg-[#12151b] p-3.5 flex flex-col items-center gap-2 animate-fade-in"
              >
                <span className="h-9 w-9 rounded-full bg-green-500/12 flex items-center justify-center">
                  <f.icon className="h-4 w-4 text-green-400" />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-medium text-white">{f.title}</div>
                  <div className="text-[11px] text-gray-500">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => { setAuthMode('signup'); setShowWelcome(false) }}
            className="btn-glow w-full mt-7 bg-green-500 text-[#08090a] rounded-xl py-3 text-[15px] font-semibold hover:bg-green-400 transition-colors"
          >
            Get started — it's free
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setShowWelcome(false) }}
            className="mt-3 text-sm text-gray-400 hover:text-white transition-colors"
          >
            I already have an account
          </button>
        </div>
      </div>
    )
  }

  // ── Sign-up gate ──
  if (authChecked && !user) {
    return (
      <div
        className="relative min-h-[100svh] flex items-center justify-center px-5 text-white overflow-hidden bg-black"
        style={{ colorScheme: 'dark' }}
      >
        <Suspense fallback={null}>
          <WebGLShader />
        </Suspense>
        <div className="absolute inset-0 bg-black/55 pointer-events-none" />
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-7">
            <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-[0_14px_34px_-14px_rgba(47,158,110,0.5)] ring-1 ring-white/10">
              <Mic className="h-7 w-7 text-white" strokeWidth={1.8} />
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-brand">BodyMind</h1>
            <p className="text-gray-400 text-sm mt-1">Log meals by voice — get instant calories &amp; protein.</p>
          </div>

          <form onSubmit={handleAuth} className="rounded-2xl border border-white/10 bg-[#12151b] p-5">
            <div className="flex gap-1 mb-4 p-1 rounded-full bg-[#12151b] border border-white/10 text-sm">
              {[['signup', 'Sign up'], ['login', 'Log in']].map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setAuthMode(m); setAuthError('') }}
                  className={`flex-1 rounded-full py-1.5 transition-colors ${
                    authMode === m ? 'bg-green-500 text-[#08090a] font-semibold' : 'text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="text-xs text-gray-400">Email</label>
            <input
              type="email" required value={authForm.email}
              onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@email.com"
              className="w-full mt-1 mb-3 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60"
            />
            <label className="text-xs text-gray-400">Password</label>
            <input
              type="password" required value={authForm.password}
              onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="6+ characters"
              className="w-full mt-1 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60"
            />
            {authError && <p className="text-red-400 text-xs mt-2">{authError}</p>}
            <button
              type="submit" disabled={authLoading}
              className="w-full mt-4 bg-green-500 text-[#08090a] rounded-lg py-2.5 text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-50"
            >
              {authLoading ? 'Please wait…' : authMode === 'signup' ? 'Create account & continue' : 'Log in'}
            </button>
          </form>

          {!isStandalone && (
            <div className="text-center mt-5">
              <p className="text-xs text-gray-600 mb-2">or</p>
              <a
                href="/download.html"
                className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-4 py-2 transition-colors"
              >
                <Download className="h-4 w-4 text-green-400" /> Download the app
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Required profile setup (must finish before using the app) ──
  if (authChecked && user && !profileComplete) {
    return (
      <div
        className="app-bg min-h-[100svh] flex items-center justify-center px-5 text-white"
        style={{ colorScheme: 'dark' }}
      >
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <User className="h-6 w-6 text-green-400" />
            </div>
            <h1 className="text-xl font-semibold">One quick step</h1>
            <p className="text-gray-400 text-sm mt-1">
              BodyMind needs your body details to set daily targets and coach you accurately.
            </p>
          </div>
          <form onSubmit={handleSaveProfile} className="rounded-2xl border border-white/10 bg-[#12151b] p-5">
            {profileFields()}
            {profileError && <p className="text-red-400 text-xs mb-2">{profileError}</p>}
            <button
              type="submit"
              disabled={profileSaving}
              className="w-full bg-green-500 text-[#08090a] rounded-lg py-2.5 text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-50"
            >
              {profileSaving ? 'Saving…' : 'Save & start'}
            </button>
          </form>
          <button type="button" onClick={handleLogout} className="mt-4 mx-auto block text-xs text-gray-500 hover:text-white">
            Log out
          </button>
        </div>
      </div>
    )
  }

  const panel =
    'rounded-2xl border border-white/10 bg-[#12151b] shadow-soft p-4 flex flex-col md:overflow-y-auto md:max-h-[calc(100svh-10rem)]'
  const panelLabel = 'text-[11px] tracking-[0.2em] uppercase text-gray-500 font-semibold'

  return (
    <div
      className="app-bg min-h-[100svh] flex flex-col text-white px-4 md:px-6"
      style={{
        colorScheme: 'dark',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Top bar */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between py-2 gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <h1 className="text-sm font-bold tracking-[0.28em] text-white">BODYMIND</h1>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              🔥 {streak}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {user && <span className="hidden sm:inline text-xs text-gray-400 max-w-[120px] truncate">{user}</span>}
          <button
            type="button" onClick={() => setShowShop(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-500/25 bg-amber-500/5 hover:border-amber-500/50 rounded-full px-3 py-1.5 transition-colors"
          >
            🛒 {coins}
          </button>
          <button
            type="button" onClick={() => setShowCustomize(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5 text-green-400" /> Coach
          </button>
          <button
            type="button" onClick={openProfile}
            className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
          >
            <User className="h-3.5 w-3.5" /> Profile
          </button>
          <button
            type="button" onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      </header>

      {/* Goal bar */}
      <div className="w-full max-w-7xl mx-auto mb-3">
        {hasTargets ? (
          <div className="rounded-2xl border border-white/10 bg-[#12151b] shadow-soft px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-sm text-white">
              <Target className="h-4 w-4 text-green-400" /> {GOAL_LABEL[profile.goal]}
            </span>
            {calOver > 0 ? (
              <span className="inline-flex items-center gap-1 text-sm rounded-full px-2.5 py-0.5 bg-red-500/12 text-red-300 border border-red-500/25">
                <TrendingUp className="h-3.5 w-3.5" /> {calOver} cal over goal
              </span>
            ) : (
              <span className="text-sm text-gray-300">
                <b className="text-white">{remaining}</b> cal left
                <span className="text-gray-500"> of {targets.calorieTarget}</span>
              </span>
            )}
            {totalBurned > 0 && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20">
                <Activity className="h-3 w-3" /> {totalBurned} burned
              </span>
            )}
            <span className="text-sm text-gray-300">
              <b className={proOver > 0 ? 'text-green-400' : 'text-white'}>{totalProtein}</b>/{targets.proteinTarget}g protein
              {proOver > 0 && <span className="text-green-400"> · goal hit ✓</span>}
            </span>
            {weightLb != null && <span className="text-sm text-gray-400">{weightLb} lb · BMI {targets.bmi}</span>}
            {trendLb != null && trendLb !== 0 && (
              <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
                trendLb < 0 ? 'bg-green-500/10 text-green-300 border border-green-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
              }`}>
                {trendLb < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {Math.abs(trendLb)} lb {trendLb < 0 ? 'lost' : 'gained'}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
              {isMobile && (
                <button
                  type="button" onClick={() => setShowScanGuide(true)}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
                >
                  <ScanLine className="h-4 w-4" /> Scan body
                </button>
              )}
              <button
                type="button" onClick={() => { setWeighInput(''); setShowWeigh(true) }}
                className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
              >
                <Scale className="h-4 w-4" /> Weigh in
              </button>
              <button
                type="button" onClick={() => openPlan(false)}
                className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-white/10 hover:border-green-500/50 rounded-full px-3 py-1.5 transition-colors"
              >
                <ClipboardList className="h-4 w-4" /> Plan
              </button>
              <button
                type="button" onClick={runCoach}
                className="btn-glow inline-flex items-center gap-1.5 text-sm font-medium bg-green-500 text-[#08090a] rounded-full px-3.5 py-1.5 hover:bg-green-400 transition-colors"
              >
                <Sparkles className="h-4 w-4" /> Coach me
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button" onClick={openProfile}
            className="w-full rounded-2xl border border-dashed border-green-500/30 bg-green-500/[0.04] px-4 py-3 text-sm text-gray-300 hover:bg-green-500/[0.08] transition-colors flex items-center justify-center gap-2"
          >
            <User className="h-4 w-4 text-green-400" /> Fill in your body profile to get targets &amp; AI coaching →
          </button>
        )}
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 w-full max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[0.95fr_1.3fr_1.4fr] gap-4 pb-3 md:min-h-0">
        {/* Log — food + exercise, grouped by day */}
        <section className={`order-3 md:order-3 ${panel}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={panelLabel}>Log</h2>
            <span className="text-[11px] text-gray-600">{todayGroup?.entries.length || 0} today</span>
          </div>

          {hasTargets || totalCalories > 0 || totalBurned > 0 ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="card-hover rounded-xl border border-white/10 bg-[#12151b] p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-green-500/12 flex items-center justify-center">
                    <Flame className="h-4 w-4 text-green-400" />
                  </span>
                  <div className="leading-tight">
                    <div className={`text-lg font-semibold ${calOver > 0 ? 'text-red-400' : 'text-white'}`}>
                      {netCalories}
                      {hasTargets && <span className="text-xs font-normal text-gray-500"> / {targets.calorieTarget}</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">net cal today</div>
                  </div>
                </div>
                {hasTargets && (
                  <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`bar-fill h-full rounded-full ${calOver > 0 ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-green-600 to-green-400'}`} style={{ width: `${calPct}%` }} />
                  </div>
                )}
                <div className="mt-1.5 text-[10px] text-gray-500">
                  ate {totalCalories}
                  {totalBurned > 0 && <> · <span className="text-amber-400">burned {totalBurned}</span></>}
                  {calOver > 0 && <> · <span className="text-red-400">{calOver} over</span></>}
                </div>
              </div>
              <div className="card-hover rounded-xl border border-white/10 bg-[#12151b] p-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-green-500/12 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-green-400" />
                  </span>
                  <div className="leading-tight">
                    <div className={`text-lg font-semibold ${proOver > 0 ? 'text-green-400' : 'text-white'}`}>
                      {totalProtein}g
                      {hasTargets && <span className="text-xs font-normal text-gray-500"> / {targets.proteinTarget}g</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">protein today</div>
                  </div>
                </div>
                {hasTargets && (
                  <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="bar-fill h-full rounded-full bg-gradient-to-r from-green-600 to-green-400" style={{ width: `${proPct}%` }} />
                  </div>
                )}
                {proOver > 0 && <div className="mt-1.5 text-[10px] text-green-400">✓ goal hit · +{proOver}g over</div>}
              </div>
            </div>
          ) : null}

          {log.length === 0 ? (
            <div className="flex-1 rounded-xl border border-dashed border-white/10 bg-[#0f131a] p-8 flex flex-col items-center justify-center text-center">
              <p className="text-gray-500 text-sm">Nothing logged yet</p>
              <p className="text-gray-600 text-xs mt-1">Speak, type, or scan a meal to start your streak.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {days.map((day, di) => (
                <div key={day.key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between sticky top-0 bg-[#08090a]/80 backdrop-blur py-1">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{dayLabel(day.key)}</span>
                    <span className="text-[10px] text-gray-600">
                      {day.cal} cal · {day.pro}g{day.burned > 0 && <span className="text-amber-400/80"> · −{day.burned} burned</span>}
                    </span>
                  </div>
                  {day.entries.map((entry, index) => {
                    const isEx = entry.kind === 'exercise'
                    return (
                      <div
                        key={entry.id}
                        ref={di === 0 && index === 0 ? topEntryRef : null}
                        className="card-hover rounded-xl border border-white/10 bg-[#12151b] p-3.5 flex flex-col gap-2 animate-fade-in"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider text-gray-500">{entry.time}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 ${isEx ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-green-500/10 text-green-300 border border-green-500/20'}`}>
                            {isEx ? <><Activity className="h-3 w-3" /> Exercise</> : <><Utensils className="h-3 w-3" /> Meal</>}
                          </span>
                        </div>
                        <p className="text-white text-sm font-medium leading-snug">{entry.transcript}</p>
                        <p className="text-gray-400 text-sm leading-relaxed">{entry.reply}</p>
                        {entry.calories != null && (
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {isEx ? (
                              <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                                <Activity className="h-3 w-3" /> −{entry.calories} cal burned
                              </span>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-300 border border-green-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                                  <Flame className="h-3 w-3" /> {entry.calories} cal
                                </span>
                                {entry.protein != null && (
                                  <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-300 border border-green-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                                    <Dumbbell className="h-3 w-3" /> {entry.protein}g protein
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {todayGroup && todayGroup.entries.length > 0 && (
            <button
              type="button"
              onClick={async () => { try { await clearLogs(); setLog((p) => p.filter((e) => localKey(new Date(e.ts)) !== todayKey)) } catch (err) { console.error(err) } }}
              className="mt-3 mx-auto inline-flex items-center gap-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear today
            </button>
          )}
        </section>

        {/* CENTER — log a meal or an exercise */}
        <section className={`order-1 md:order-2 ${panel} items-center justify-center gap-5`}>
          <div className="flex flex-col items-center gap-2.5">
            <h2 className={panelLabel}>Log it</h2>
            <div className="flex gap-1 p-1 rounded-full bg-[#0f131a] border border-white/10 text-xs">
              {[['food', '🍽 Meal'], ['exercise', '🏋 Exercise']].map(([k, label]) => (
                <button
                  key={k} type="button" onClick={() => setLogKind(k)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    logKind === k
                      ? k === 'exercise'
                        ? 'bg-amber-500 text-[#08090a] font-semibold'
                        : 'bg-green-500 text-[#08090a] font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            {listening && (
              <>
                <span className={`absolute h-28 w-28 rounded-full ripple ${logKind === 'exercise' ? 'bg-amber-500/20' : 'bg-green-500/20'}`} />
                <span className={`absolute h-28 w-28 rounded-full ripple ripple-delay ${logKind === 'exercise' ? 'bg-amber-500/20' : 'bg-green-500/20'}`} />
              </>
            )}
            <button
              type="button" onClick={handleClick} disabled={!supported || loading}
              aria-label={logKind === 'exercise' ? 'Tap to log a workout by voice' : 'Tap to speak your meal'} aria-pressed={listening}
              className={`relative h-28 w-28 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed ${
                logKind === 'exercise' ? 'focus-visible:ring-amber-400' : 'focus-visible:ring-green-400'
              } ${loading ? 'opacity-60 ' : ''}${
                listening
                  ? logKind === 'exercise'
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-[0_14px_34px_-12px_rgba(217,154,58,0.55)]'
                    : 'bg-gradient-to-br from-green-500 to-green-700 shadow-[0_14px_34px_-12px_rgba(28,138,95,0.55)]'
                  : logKind === 'exercise'
                    ? 'bg-[#12151b] border border-amber-600/30 shadow-[0_10px_26px_-14px_rgba(16,26,20,0.4)] hover:border-amber-500/60'
                    : 'bg-[#12151b] border border-green-600/30 shadow-[0_10px_26px_-14px_rgba(16,26,20,0.4)] hover:border-green-600/60 hover:shadow-[0_14px_30px_-12px_rgba(28,138,95,0.3)]'
              }`}
            >
              {loading ? (
                <Loader2 className={`h-9 w-9 animate-spin ${logKind === 'exercise' ? 'text-amber-300' : 'text-green-300'}`} strokeWidth={1.75} />
              ) : logKind === 'exercise' ? (
                <Activity className={`h-9 w-9 ${listening ? 'text-white' : 'text-amber-300'}`} strokeWidth={1.75} />
              ) : (
                <Mic className={`h-9 w-9 ${listening ? 'text-white' : 'text-green-300'}`} strokeWidth={1.75} />
              )}
            </button>
          </div>

          <div className="min-h-[2.75rem] flex flex-col items-center gap-2 text-center">
            {!supported ? (
              <p className="text-red-400 text-sm">Voice not supported — try Chrome</p>
            ) : listening ? (
              <p className="text-white text-sm max-w-xs">{interimTranscript || 'Listening…'}</p>
            ) : micError ? (
              <p className="text-red-400 text-sm max-w-xs">{micError}</p>
            ) : loading ? (
              <p className="text-gray-400 text-sm animate-pulse">Analyzing…</p>
            ) : notice ? (
              <p className="text-amber-300 text-sm max-w-xs">{notice}</p>
            ) : error ? (
              <p className="text-red-400 text-sm">Couldn't process that — try again</p>
            ) : clarify ? (
              <div className="flex flex-col items-center gap-2.5 animate-fade-in">
                <p className="text-amber-300 text-sm max-w-xs">{clarify.question}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {clarify.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleClarifyChoice(opt)}
                      className="text-xs bg-green-500/10 text-green-300 border border-green-500/30 rounded-full px-3 py-1.5 hover:bg-green-500/20 transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : reply ? (
              <div className="animate-fade-in flex flex-col items-center gap-2">
                <p className={`text-sm max-w-xs leading-relaxed ${nutrition?.kind === 'exercise' ? 'text-amber-300' : 'text-green-300'}`}>{reply}</p>
                {nutrition && (
                  <div className="flex gap-2">
                    {nutrition.kind === 'exercise' ? (
                      <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                        <Activity className="h-3 w-3" /> −{nutrition.calories} cal burned
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-300 border border-green-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                          <Flame className="h-3 w-3" /> {nutrition.calories} cal
                        </span>
                        {nutrition.protein != null && (
                          <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-300 border border-green-500/20 rounded-full px-2.5 py-1 text-[11px] font-medium">
                            <Dumbbell className="h-3 w-3" /> {nutrition.protein}g protein
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                {logKind === 'exercise' ? 'Tap to log a workout — e.g. “30 min run”' : 'Tap to speak your meal'}
              </p>
            )}
          </div>

          <form onSubmit={handleTextSubmit} className="w-full max-w-sm">
            <div className={`flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0f131a] focus-within:bg-[#12151b] transition-colors pl-4 pr-1.5 py-1.5 ${logKind === 'exercise' ? 'focus-within:border-amber-500/60' : 'focus-within:border-green-500/60'}`}>
              <input
                type="text" value={text} onChange={(e) => setText(e.target.value)}
                placeholder={logKind === 'exercise' ? 'Or type a workout…' : 'Or type a food…'} disabled={loading}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit" disabled={loading || !text.trim()} aria-label="Send"
                className={`shrink-0 h-9 w-9 flex items-center justify-center text-[#08090a] rounded-full transition-opacity disabled:opacity-30 disabled:cursor-not-allowed ${logKind === 'exercise' ? 'bg-amber-500 hover:bg-amber-400' : 'bg-green-500 hover:bg-green-400'}`}
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            </div>
          </form>

          {logKind === 'exercise' ? (
            <p className="text-[11px] text-gray-600 text-center max-w-xs leading-relaxed">
              Says how many calories you burned (from your body weight) and adds it back to your day.
            </p>
          ) : (
            <button
              type="button" onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)} onDrop={handleDrop} disabled={loading}
              className={`w-full max-w-sm rounded-xl border border-dashed text-xs py-2.5 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                dragging ? 'border-green-400 bg-green-500/10 text-white' : 'border-white/15 text-gray-400 hover:text-white hover:border-green-500/50 hover:bg-[#12151b]'
              }`}
            >
              <Camera className="h-4 w-4 text-green-400" /> Scan a food photo / PDF
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
          <input ref={bodyFileRef} type="file" accept="image/*" capture="environment" onChange={handleBodyFile} className="hidden" />
        </section>

        {/* Left column — Meals checklist + Workouts checklist */}
        <div className="order-2 md:order-1 flex flex-col gap-4 md:overflow-y-auto md:max-h-[calc(100svh-10rem)] md:pr-1">
          {/* Meals */}
          <section className="rounded-2xl border border-white/10 bg-[#12151b] shadow-soft p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className={`${panelLabel} flex items-center gap-1.5`}>
                <Utensils className="h-3 w-3 text-green-400" /> Meals
              </h2>
              <button
                type="button" onClick={() => openPlan(true)} disabled={planLoading}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400 hover:text-green-300 disabled:opacity-50"
              >
                {planLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {planLoading ? 'Building…' : 'Auto-plan'}
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addItem('food', mealInput, setMealInput) }} className="mb-3">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0f131a] focus-within:border-green-500/60 pl-3 pr-1 py-1">
                <input
                  value={mealInput} onChange={(e) => setMealInput(e.target.value)}
                  placeholder="Add a meal…"
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                />
                <button type="submit" disabled={!mealInput.trim()} aria-label="Add meal"
                  className="shrink-0 h-7 w-7 flex items-center justify-center bg-green-500 text-[#08090a] rounded-md disabled:opacity-30 hover:bg-green-400 transition">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
            {mealItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#0f131a] p-5 text-center">
                <p className="text-gray-500 text-sm">No meals planned</p>
                <p className="text-gray-600 text-xs mt-1">Add one or tap <b className="text-green-400">Auto-plan</b>. Tick to log it.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">{mealItems.map(renderChecklistItem)}</div>
            )}
          </section>

          {/* Workouts */}
          <section className="rounded-2xl border border-white/10 bg-[#12151b] shadow-soft p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className={`${panelLabel} flex items-center gap-1.5`}>
                <Activity className="h-3 w-3 text-amber-400" /> Workouts
              </h2>
              {exItems.length > 0 && (
                <span className="text-[11px] text-gray-600">{exItems.filter((i) => i.done).length}/{exItems.length} done</span>
              )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addItem('exercise', exInput, setExInput) }} className="mb-3">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0f131a] focus-within:border-amber-500/60 pl-3 pr-1 py-1">
                <input
                  value={exInput} onChange={(e) => setExInput(e.target.value)}
                  placeholder="Add a workout…"
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                />
                <button type="submit" disabled={!exInput.trim()} aria-label="Add workout"
                  className="shrink-0 h-7 w-7 flex items-center justify-center bg-amber-500 text-[#08090a] rounded-md disabled:opacity-30 hover:bg-amber-400 transition">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </form>
            {exItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#0f131a] p-5 text-center">
                <p className="text-gray-500 text-sm">No workouts yet</p>
                <p className="text-gray-600 text-xs mt-1">Add one — tick it to log calories burned. 🔥</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">{exItems.map(renderChecklistItem)}</div>
            )}
          </section>
        </div>
      </div>

      {/* ── Hourly reminder toast ── */}
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-[#12151b] border border-green-500/30 text-green-300 text-sm rounded-full px-4 py-2 shadow-lg animate-fade-in max-w-[90vw] text-center">
          {toast}
        </div>
      )}

      {/* ── Daily meal plan modal ── */}
      {showPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPlan(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[80svh] overflow-y-auto rounded-2xl border border-green-500/20 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium flex items-center gap-2"><ClipboardList className="h-4 w-4 text-green-400" /> Today's plan</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openPlan(true)} disabled={planLoading} className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50">New plan</button>
                <button type="button" onClick={() => setShowPlan(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
            </div>
            {planLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Building your plan…</div>
            ) : (
              <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{planText}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Roaming coach mascot (tap to open the coach chat) ── */}
      {!showCoach && (
        <button
          ref={coachRef}
          type="button"
          onPointerDown={onMascotDown}
          onPointerMove={onMascotMove}
          onPointerUp={onMascotUp}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              runCoach()
            }
          }}
          aria-label="Chat with Coach Remy (drag to throw)"
          className={`roaming-coach rc-${coachMode} cc-build-${coachStyle.build}${nearCoach ? ' rc-swinging' : ''}${playEmote ? ' rc-play' : ''}${feed?.who === 'coach' ? ' ch-eat' : ''}`}
          style={{
            '--cc-body': COACH_COLORS[coachStyle.color].body,
            '--cc-shade': COACH_COLORS[coachStyle.color].shade,
            '--cc-dark': COACH_COLORS[coachStyle.color].dark,
            '--cc-knuckle': COACH_COLORS[coachStyle.color].knuckle,
          }}
        >
          <span className="rc-emote">{playEmote ? '💚' : ''}</span>
          {feed?.who === 'coach' && <span className="char-speech">{feed.text}</span>}
          <span className="rc-tip">{nearCoach ? 'Back off! 🏋️' : 'Throw me · tap to chat'}</span>
          <span className="rc-aura" />
          <span className="rc-face">
            <span className="rc-bob">
              <svg viewBox="0 0 72 100" className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                {/* pull-up bar (stays fixed; shown during pull-ups) */}
                <g className="rc-bar">
                  <rect x="11" y="2" width="3" height="13" rx="1.5" fill="#334155" />
                  <rect x="58" y="2" width="3" height="13" rx="1.5" fill="#334155" />
                  <rect x="9" y="6" width="54" height="4.5" rx="2.25" fill="#64748b" />
                </g>
                {/* body (animated) */}
                <g transform="translate(0,8)">
                  <g className="rc-figure">
                    {/* barbell held at the waist (shown during lifts) */}
                    <g className="rc-barbell">
                      <rect x="8" y="55" width="56" height="3.4" rx="1.7" fill="#cbd5e1" />
                      <rect x="6" y="51" width="5" height="12" rx="2" fill="#1f2937" />
                      <rect x="61" y="51" width="5" height="12" rx="2" fill="#1f2937" />
                    </g>
                    {/* thick legs */}
                    <path d="M24 64 Q24 80 28 85 L33 85 Q34 72 34 64 Z" fill="var(--cc-dark)" />
                    <path d="M48 64 Q48 80 44 85 L39 85 Q38 72 38 64 Z" fill="var(--cc-dark)" />
                    <ellipse cx="29" cy="86" rx="7" ry="3" fill="#ffffff" />
                    <ellipse cx="43" cy="86" rx="7" ry="3" fill="#ffffff" />
                    {/* shorts */}
                    <path d="M22 58 Q36 64 50 58 L48 66 Q36 70 24 66 Z" fill="#0f172a" />
                    {/* big arms */}
                    <circle cx="16" cy="40" r="9" fill="var(--cc-body)" />
                    <circle cx="14" cy="38" r="2.6" fill="var(--cc-knuckle)" />
                    <rect x="11" y="44" width="8" height="13" rx="4" fill="var(--cc-body)" />
                    <circle cx="56" cy="40" r="9" fill="var(--cc-body)" />
                    <circle cx="58" cy="38" r="2.6" fill="var(--cc-knuckle)" />
                    <rect x="53" y="44" width="8" height="13" rx="4" fill="var(--cc-body)" />
                    {/* dumbbell — his weapon, gripped in the right hand */}
                    <g className="rc-weapon-db">
                      <rect x="55" y="55.6" width="17" height="3.6" rx="1.8" fill="#94a3b8" />
                      <rect x="61.5" y="51" width="6.5" height="12.8" rx="2.4" fill="#0b1220" />
                      <rect x="68.5" y="51" width="6.5" height="12.8" rx="2.4" fill="#0b1220" />
                      <rect x="59.5" y="53.5" width="3" height="7.8" rx="1.3" fill="#1f2937" />
                      <rect x="75.5" y="53.5" width="3" height="7.8" rx="1.3" fill="#1f2937" />
                      <circle cx="57" cy="57.4" r="3.4" fill="var(--cc-knuckle)" />
                    </g>
                    {/* torso V-taper */}
                    <path d="M18 32 Q36 26 54 32 L46 60 Q36 64 26 60 Z" fill="var(--cc-body)" />
                    <ellipse cx="29" cy="38" rx="7" ry="5" fill="var(--cc-shade)" />
                    <ellipse cx="43" cy="38" rx="7" ry="5" fill="var(--cc-shade)" />
                    <path d="M36 42 L36 58" stroke="var(--cc-dark)" strokeWidth="1.4" />
                    <path d="M30 46 H42 M30 51 H42 M31 56 H41" stroke="var(--cc-dark)" strokeWidth="1.2" opacity="0.7" />
                    <path d="M28 28 Q36 24 44 28 L44 32 Q36 30 28 32 Z" fill="var(--cc-shade)" />
                    {/* head (bald) */}
                    <circle cx="36" cy="19" r="9" fill="var(--cc-body)" />
                    <rect x="29" y="17" width="6.5" height="4" rx="2" fill="#0c1a12" />
                    <rect x="36.5" y="17" width="6.5" height="4" rx="2" fill="#0c1a12" />
                    <rect x="34.5" y="18" width="2" height="1.4" fill="#0c1a12" />
                    <path d="M32 24 Q36 27 40 24" stroke="#0c1a12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    <path d="M28 30 Q36 27 44 30" stroke="#0c1a12" strokeWidth="1.3" fill="none" />
                    <circle cx="44" cy="40" r="3" fill="#f59e0b" />
                    {/* accessory (chosen in Customize) */}
                    {coachStyle.accessory === 'cap' && (
                      <g>
                        <path d="M27 13.5 Q36 4.5 45 13.5 L45 15 L27 15 Z" fill="#1f2937" />
                        <rect x="43.5" y="13.4" width="8.5" height="2.6" rx="1.3" fill="#111827" />
                      </g>
                    )}
                    {coachStyle.accessory === 'headband' && (
                      <>
                        <rect x="26.5" y="12.6" width="19" height="3.6" rx="1.8" fill="#dc5b5b" />
                        <rect x="44" y="13" width="7" height="2.6" rx="1.3" fill="#dc5b5b" transform="rotate(22 44 14)" />
                      </>
                    )}
                    {coachStyle.accessory === 'shades' && (
                      <g>
                        <rect x="28.3" y="15.8" width="7" height="4.8" rx="1.4" fill="#0b0f14" />
                        <rect x="36.7" y="15.8" width="7" height="4.8" rx="1.4" fill="#0b0f14" />
                        <rect x="35.3" y="17" width="1.4" height="1.6" fill="#0b0f14" />
                      </g>
                    )}
                    {coachStyle.accessory === 'chain' && (
                      <g>
                        <path d="M30 29 Q36 35.5 42 29" stroke="#f5c542" strokeWidth="1.8" fill="none" />
                        <circle cx="36" cy="34" r="2" fill="#f5c542" />
                      </g>
                    )}
                  </g>
                </g>
              </svg>
            </span>
          </span>
        </button>
      )}

      {/* ── "You" character — physique reflects your food ── */}
      {!showCoach && (
        <div
          className={`you-char${strongerThanCoach ? ' yc-swole' : ''}${softness > 0.6 ? ' yc-sad' : ''}${playEmote ? ' yc-play' : ''}${feed?.who === 'you' ? ' ch-eat' : ''}`}
          style={{ '--bulk': bulk, '--soft': softness }}
          aria-hidden="true"
        >
          <span className="yc-tip">You · {youMood}</span>
          <span className="yc-emote">{playEmote ? '🤝' : ''}</span>
          {feed?.who === 'you' && <span className="char-speech">{feed.text}</span>}
          <span className="yc-bob">
            <svg viewBox="0 0 64 90" className="w-full h-full">
              <rect x="22" y="62" width="8" height="20" rx="3" fill="#caa078" />
              <rect x="34" y="62" width="8" height="20" rx="3" fill="#caa078" />
              <ellipse cx="26" cy="84" rx="6" ry="2.6" fill="#ffffff" />
              <ellipse cx="38" cy="84" rx="6" ry="2.6" fill="#ffffff" />
              <path d="M20 56 Q32 62 44 56 L42 64 Q32 68 22 64 Z" fill="#334155" />
              <rect x="11" y="36" width="7" height="17" rx="3.5" fill="#e3b483" />
              <rect x="46" y="36" width="7" height="17" rx="3.5" fill="#e3b483" />
              <ellipse className="yc-belly" cx="32" cy="46" rx="15" ry="14" fill="#e3b483" />
              <g className="yc-muscle">
                <ellipse cx="26" cy="42" rx="5.5" ry="4" fill="#d49a64" />
                <ellipse cx="38" cy="42" rx="5.5" ry="4" fill="#d49a64" />
                <path d="M32 47 L32 56" stroke="#c98a52" strokeWidth="1.2" />
              </g>
              <circle cx="32" cy="22" r="9" fill="#e3b483" />
              <circle cx="29" cy="21" r="1.3" fill="#0c1a12" />
              <circle cx="35" cy="21" r="1.3" fill="#0c1a12" />
              <path className="yc-smile" d="M29 25.5 Q32 28.5 35 25.5" stroke="#0c1a12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path className="yc-frown" d="M29 27 Q32 24.5 35 27" stroke="#0c1a12" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      )}

      {/* ── Customize coach modal ── */}
      {showCustomize && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCustomize(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium flex items-center gap-2"><Sparkles className="h-4 w-4 text-green-400" /> Customize coach</h3>
              <button type="button" onClick={() => setShowCustomize(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div
              className="flex justify-center mb-4"
              style={{
                '--cc-body': COACH_COLORS[coachStyle.color].body,
                '--cc-shade': COACH_COLORS[coachStyle.color].shade,
                '--cc-dark': COACH_COLORS[coachStyle.color].dark,
                '--cc-knuckle': COACH_COLORS[coachStyle.color].knuckle,
              }}
            >
              <svg viewBox="0 0 72 66" className="h-32" style={{ transform: `scaleX(${({ slim: 0.82, normal: 0.95, buff: 1.08, round: 1.3 })[coachStyle.build]})` }}>
                <circle cx="16" cy="40" r="9" fill="var(--cc-body)" />
                <rect x="11" y="44" width="8" height="13" rx="4" fill="var(--cc-body)" />
                <circle cx="56" cy="40" r="9" fill="var(--cc-body)" />
                <rect x="53" y="44" width="8" height="13" rx="4" fill="var(--cc-body)" />
                <path d="M18 32 Q36 26 54 32 L46 60 Q36 64 26 60 Z" fill="var(--cc-body)" />
                <ellipse cx="29" cy="38" rx="7" ry="5" fill="var(--cc-shade)" />
                <ellipse cx="43" cy="38" rx="7" ry="5" fill="var(--cc-shade)" />
                <path d="M36 42 L36 58" stroke="var(--cc-dark)" strokeWidth="1.4" />
                <circle cx="36" cy="19" r="9" fill="var(--cc-body)" />
                <rect x="29" y="17" width="6.5" height="4" rx="2" fill="#0c1a12" />
                <rect x="36.5" y="17" width="6.5" height="4" rx="2" fill="#0c1a12" />
                <path d="M32 24 Q36 27 40 24" stroke="#0c1a12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                {coachStyle.accessory === 'cap' && (<g><path d="M27 13.5 Q36 4.5 45 13.5 L45 15 L27 15 Z" fill="#1f2937" /><rect x="43.5" y="13.4" width="8.5" height="2.6" rx="1.3" fill="#111827" /></g>)}
                {coachStyle.accessory === 'headband' && (<><rect x="26.5" y="12.6" width="19" height="3.6" rx="1.8" fill="#dc5b5b" /><rect x="44" y="13" width="7" height="2.6" rx="1.3" fill="#dc5b5b" transform="rotate(22 44 14)" /></>)}
                {coachStyle.accessory === 'shades' && (<g><rect x="28.3" y="15.8" width="7" height="4.8" rx="1.4" fill="#0b0f14" /><rect x="36.7" y="15.8" width="7" height="4.8" rx="1.4" fill="#0b0f14" /><rect x="35.3" y="17" width="1.4" height="1.6" fill="#0b0f14" /></g>)}
                {coachStyle.accessory === 'chain' && (<g><path d="M30 29 Q36 35.5 42 29" stroke="#f5c542" strokeWidth="1.8" fill="none" /><circle cx="36" cy="34" r="2" fill="#f5c542" /></g>)}
              </svg>
            </div>

            <label className="text-xs text-gray-400">Color</label>
            <div className="flex flex-wrap gap-2 mt-1.5 mb-4">
              {Object.entries(COACH_COLORS).map(([k, c]) => (
                <button key={k} type="button" onClick={() => setCoachStyle((s) => ({ ...s, color: k }))} aria-label={k}
                  className={`h-8 w-8 rounded-full transition ${coachStyle.color === k ? 'ring-2 ring-white' : 'ring-1 ring-white/20 hover:ring-white/50'}`}
                  style={{ background: c.body }} />
              ))}
            </div>

            <label className="text-xs text-gray-400">Accessory</label>
            <div className="grid grid-cols-5 gap-1.5 mt-1.5 mb-4">
              {COACH_ACCESSORIES.map((a) => (
                <button key={a} type="button" onClick={() => setCoachStyle((s) => ({ ...s, accessory: a }))}
                  className={`rounded-lg py-1.5 text-[11px] capitalize border transition ${coachStyle.accessory === a ? 'bg-green-500 text-[#08090a] border-green-500 font-semibold' : 'bg-[#0f131a] text-gray-300 border-white/10 hover:border-green-500/40'}`}>
                  {a}
                </button>
              ))}
            </div>

            <label className="text-xs text-gray-400">Build</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {COACH_BUILDS.map((b) => (
                <button key={b} type="button" onClick={() => setCoachStyle((s) => ({ ...s, build: b }))}
                  className={`rounded-lg py-1.5 text-[11px] capitalize border transition ${coachStyle.build === b ? 'bg-green-500 text-[#08090a] border-green-500 font-semibold' : 'bg-[#0f131a] text-gray-300 border-white/10 hover:border-green-500/40'}`}>
                  {b}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-4 text-center">Your “You” buddy's build changes with what you eat 🍎💪</p>
          </div>
        </div>
      )}

      {/* ── Shop modal ── */}
      {showShop && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowShop(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85svh] overflow-y-auto rounded-2xl border border-white/10 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-medium flex items-center gap-2">🛒 Shop &amp; feed</h3>
              <button type="button" onClick={() => setShowShop(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex items-center justify-between mb-4 text-[11px]">
              <span className="text-amber-300 font-semibold">🪙 {coins} coins</span>
              <span className={strongerThanCoach ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                💪 You {youStrength}/{COACH_STRENGTH}{strongerThanCoach ? ' · 👑 stronger than coach!' : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-4">
              <div className="bar-fill h-full rounded-full bg-gradient-to-r from-green-600 to-green-400" style={{ width: `${Math.min(100, Math.max(0, Math.round((youStrength / COACH_STRENGTH) * 100)))}%` }} />
            </div>
            <div className="flex flex-col gap-2">
              {SHOP.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0f131a] p-2.5">
                  <span className="text-2xl shrink-0">{item.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-medium leading-tight">{item.name}</div>
                    <div className="text-[11px] text-gray-500">🪙 {item.cost} · <span className={item.xp >= 0 ? 'text-green-400' : 'text-red-400'}>{item.xp >= 0 ? `+${item.xp}` : item.xp} 💪</span></div>
                  </div>
                  <button type="button" onClick={() => feedCharacter(item, 'you')} disabled={coins < item.cost}
                    className="shrink-0 text-[11px] rounded-lg px-2.5 py-1.5 bg-green-500 text-[#08090a] font-semibold disabled:opacity-30 hover:bg-green-400 transition">Feed You</button>
                  <button type="button" onClick={() => feedCharacter(item, 'coach')} disabled={coins < item.cost}
                    className="shrink-0 text-[11px] rounded-lg px-2.5 py-1.5 border border-white/15 text-gray-200 disabled:opacity-30 hover:border-green-500/50 transition">Feed Coach</button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-4 text-center leading-relaxed">
              Earn 🪙 by logging meals &amp; keeping your streak. Feed <b className="text-green-400">protein</b> to grow — stay consistent and you'll out‑lift your coach 👑
            </p>
          </div>
        </div>
      )}

      {/* ── Profile modal ── */}
      {showProfile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !profileSaving && setShowProfile(false)}>
          <form onSubmit={handleSaveProfile} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium flex items-center gap-2"><User className="h-4 w-4 text-green-400" /> Your body</h3>
              <button type="button" onClick={() => setShowProfile(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            {profileFields()}

            {profileError && <p className="text-red-400 text-xs mb-2">{profileError}</p>}
            <button type="submit" disabled={profileSaving} className="w-full bg-green-500 text-[#08090a] rounded-lg py-2.5 text-sm font-semibold hover:bg-green-400 transition-colors disabled:opacity-50">
              {profileSaving ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </div>
      )}

      {/* ── Weigh-in modal ── */}
      {showWeigh && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowWeigh(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium flex items-center gap-2"><Scale className="h-4 w-4 text-green-400" /> Daily weigh-in</h3>
              <button type="button" onClick={() => setShowWeigh(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <label className="text-xs text-gray-400">Today's weight ({form.unit === 'imperial' ? 'lb' : 'kg'})</label>
            <input
              type="number" min="0" autoFocus value={weighInput}
              onChange={(e) => setWeighInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWeighIn()}
              placeholder={form.unit === 'imperial' ? 'lb' : 'kg'}
              className="w-full mt-1 mb-4 bg-[#0f131a] border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60"
            />
            <button type="button" onClick={handleWeighIn} className="w-full bg-green-500 text-[#08090a] rounded-lg py-2.5 text-sm font-semibold hover:bg-green-400 transition-colors">
              Save weight
            </button>
          </div>
        </div>
      )}

      {/* ── Coach chat modal ── */}
      {showCoach && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCoach(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md h-[80svh] max-h-[620px] rounded-2xl border border-green-500/20 bg-[#12151b] p-4 flex flex-col animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-lg ring-1 ring-white/10 shadow-[0_6px_16px_-6px_rgba(47,158,110,0.4)]">🥑</span>
                <div className="leading-tight">
                  <div className="text-white font-medium text-sm">Coach Remy</div>
                  <div className="text-[11px] text-green-400">your nutrition coach</div>
                </div>
              </div>
              <button type="button" onClick={() => setShowCoach(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
              {coachMessages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="self-end max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-green-500 text-[#08090a]">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="self-start flex items-end gap-2 max-w-[90%]">
                    <span className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-sm">🥑</span>
                    <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-white/[0.06] text-gray-200">{m.text}</div>
                  </div>
                ),
              )}
              {coachLoading && (
                <div className="self-start flex items-end gap-2">
                  <span className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-sm">🥑</span>
                  <div className="inline-flex items-center gap-2 text-gray-400 text-sm bg-white/[0.06] rounded-2xl px-3.5 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin" /> thinking…
                  </div>
                </div>
              )}
              <div ref={coachEndRef} />
            </div>

            <form onSubmit={sendCoachMessage} className="flex items-center gap-2 pt-3 mt-1 border-t border-white/10">
              <input
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                placeholder="Ask your coach anything…"
                className="flex-1 bg-[#0f131a] border border-white/15 rounded-full px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/60"
              />
              <button
                type="submit" disabled={coachLoading || !coachInput.trim()} aria-label="Send"
                className="shrink-0 h-9 w-9 flex items-center justify-center bg-green-500 text-[#08090a] rounded-full disabled:opacity-30 hover:bg-green-400 transition-opacity"
              >
                <Send className="h-[18px] w-[18px]" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Body scan guide ── */}
      {showScanGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowScanGuide(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl border border-green-500/20 bg-[#12151b] p-5 text-center animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium flex items-center gap-2"><ScanLine className="h-4 w-4 text-green-400" /> Body scan</h3>
              <button type="button" onClick={() => setShowScanGuide(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="relative mx-auto my-3 h-24 w-16 flex items-center justify-center">
              <Smartphone className="h-16 w-16 text-green-400" strokeWidth={1.4} />
              <ArrowUpDown className="absolute -right-3 h-7 w-7 text-green-300 animate-bounce" />
            </div>

            <p className="text-gray-300 text-sm font-medium">Slowly move your phone from your head down to your feet</p>
            <ol className="text-left text-xs text-gray-400 leading-relaxed mt-3 space-y-1.5 list-decimal list-inside">
              <li>Prop your phone up (or ask someone to hold it) so your <b className="text-gray-200">whole body</b> fits.</li>
              <li>Point it at yourself and pan slowly <b className="text-gray-200">top → bottom</b>.</li>
              <li>Capture a clear, full-length photo in good light.</li>
            </ol>

            <button
              type="button"
              onClick={() => { setShowScanGuide(false); bodyFileRef.current?.click() }}
              className="w-full mt-5 inline-flex items-center justify-center gap-2 bg-green-500 text-[#08090a] rounded-lg py-2.5 text-sm font-semibold hover:bg-green-400 transition-colors"
            >
              <Camera className="h-4 w-4" /> Open camera
            </button>
          </div>
        </div>
      )}

      {/* ── Body scan modal ── */}
      {showBody && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowBody(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-green-500/20 bg-[#12151b] p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium flex items-center gap-2"><ScanLine className="h-4 w-4 text-green-400" /> Body scan</h3>
              <button type="button" onClick={() => setShowBody(false)} aria-label="Close" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            {bodyLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing your photo…
              </div>
            ) : (
              <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{bodyAnalysis}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
