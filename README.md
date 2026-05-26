# Show Culc v2 — Deploy Guide

## What's in this package
- src/App.jsx       → Full app with AI engine (2191 lines)
- src/main.jsx      → React entry point
- index.html        → PWA-ready shell with iPhone meta tags
- public/manifest.json    → App name, icons, standalone mode
- public/sw.js           → Service worker (offline support)
- public/icon.svg/.png   → App icons
- public/apple-touch-icon.png → iPhone home screen icon
- vite.config.js    → Build config
- package.json      → Dependencies

---

## Deploy to Vercel in 5 minutes

### Step 1 — Build the app
Open Terminal, navigate to this folder, run:
```
npm install
npm run build
```
This creates a `dist/` folder — your finished app.

### Step 2 — Deploy (two options)

**Option A — Drag & Drop (fastest)**
1. Go to vercel.com → New Project
2. Click "Browse" or drag your `dist/` folder in
3. Done — you get a live URL in ~30 seconds

**Option B — GitHub (best for updates)**
1. Push this entire folder to a GitHub repo
2. vercel.com → New Project → Import your repo
3. Vercel detects Vite automatically → click Deploy
4. Every push to main auto-deploys

---

## Add to iPhone Home Screen (PWA)

1. Open your Vercel URL in **Safari** on your iPhone
   (must be Safari — Chrome won't allow Add to Home Screen)
2. Tap the **Share button** (box with arrow, bottom of Safari)
3. Scroll down → tap **"Add to Home Screen"**
4. Name: **Floor Culc** → tap **Add**

The app now appears on your home screen.
Opens full screen, no browser chrome, works offline.
All your boards, vinyls, projects and AI profile save to your phone.

---

## Update the app after changes

If you used Option A (drag & drop):
1. Make changes to src/App.jsx
2. Run `npm run build` again
3. Drag the new `dist/` folder into Vercel

If you used Option B (GitHub):
1. Make changes, push to GitHub
2. Vercel auto-deploys in ~60 seconds

---

## Local development

Do not use VS Code Live Server for this project. This is a Vite app and must be served through Vite so JSX is transpiled correctly and `public/` assets are served from the correct root.

```
npm install
npm start
```

or

```
npm run dev
```

Opens at http://localhost:5173
Hot reload — changes appear instantly.

---

## What's in the AI engine

- 24 layout strategies tested per board per room
- Scoring: waste (35%) + install safety (30%) + aesthetics (20%) + cost (15%)
- Hard veto: cuts under 80mm, waste over 30%
- Installer Fingerprint: personalises after 3+ completed jobs
- Session cache: same room = instant result (no re-scoring)
- Full offline: zero API calls for core AI logic
