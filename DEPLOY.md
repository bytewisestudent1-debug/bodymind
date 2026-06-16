# Deploying BodyMind (Render — all‑in‑one)

One Render web service runs the Express server, which serves **both** the API and
the built React app. A free Render Postgres is created alongside it. ~15 minutes.

## What you get
- `https://bodymind.onrender.com` (your URL) — frontend + API on one HTTPS origin.
- Mic (voice logging) and PWA install work, because it's HTTPS.
- Tables are created automatically on first boot (no manual SQL).

---

## 1. Put the code on GitHub
From the project folder (`Dietary-AI`):

```bash
git init
git add -A
git commit -m "BodyMind"
git branch -M main
# create an EMPTY repo on github.com first (no README), then:
git remote add origin https://github.com/<you>/bodymind.git
git push -u origin main
```

Your secret key is safe: `server/.env` is git‑ignored and never uploaded.

## 2. Create the Blueprint on Render
1. Go to https://render.com → sign in (GitHub login is easiest).
2. **New ▸ Blueprint** → pick your `bodymind` repo → **Apply**.
3. Render reads `render.yaml` and creates **two things**: the Postgres DB and the
   web service. Let it provision the DB first.

## 3. Add your Gemini key
On the **bodymind** web service → **Environment** → the `GEMINI_API_KEY` row is
empty (it's marked `sync: false` on purpose). Paste your key from
https://aistudio.google.com/apikey → **Save**. (`DATABASE_URL` is wired
automatically from the DB.)

## 4. Deploy
It builds automatically (`npm install → vite build → install server deps → start`).
First build takes a few minutes. When it's **Live**, open the service URL.

That's it — sign up, set your profile, start logging.

---

## Good to know (free tier)
- **Cold starts:** the free web service sleeps after ~15 min idle; the next visit
  takes ~50s to wake. Fine for a demo; upgrade to remove it.
- **Postgres expires after 90 days** on the free plan (back it up / recreate, or
  upgrade for a permanent DB).
- **Gemini free tier ≈ 20 requests/day per model.** Auto‑plan, coaching, and AI
  estimates draw from this; ticking pre‑estimated plan items is free. Enable
  Gemini billing for heavy use.

## Run it locally (unchanged)
```bash
docker compose up -d                 # database
cd server && npm install && npm start  # backend (terminal 2)
npm install && npm run dev           # frontend → http://localhost:5173 (terminal 3)
```

## Updating the live site
Push to `main` → Render auto‑deploys.
```bash
git add -A && git commit -m "update" && git push
```
