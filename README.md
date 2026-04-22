# 絆 Kizuna

> *Warmth, loyalty & invisible strength — the thread that connects hearts across time and distance.*

A mobile-first executive productivity app. Install it on your iPhone as a PWA (no App Store needed).

---

## One-time setup (≈ 20 minutes)

### Step 1 — Generate the app icons

1. Open `public/generate-icons.html` in any browser (just double-click the file)
2. Click **⬇ Download icon-192.png** → save into `public/`
3. Click **⬇ Download icon-512.png** → save into `public/`

### Step 2 — Create a GitHub repository

1. Go to [github.com](https://github.com) → **New repository**
2. Name it exactly: `kizuna-app`
3. Set it to **Public** (required for the free GitHub Pages tier)
4. Do **not** initialise with a README (you already have one)

### Step 3 — Push the project

Open Terminal (Mac) or Command Prompt (Windows) in this folder and run:

```bash
git init
git add .
git commit -m "🌸 Initial Kizuna release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kizuna-app.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 4 — Enable GitHub Pages

1. Open your repository on GitHub
2. Go to **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **GitHub Actions**
4. Save — the workflow will start automatically

Wait 2–3 minutes. GitHub Actions will install, build, and deploy the app.  
Your live URL will be: `https://YOUR_USERNAME.github.io/kizuna-app/`

### Step 5 — Install on iPhone

> ⚠️ Must use **Safari** — Chrome on iOS cannot install PWAs.

1. Open Safari on your iPhone
2. Navigate to `https://YOUR_USERNAME.github.io/kizuna-app/`
3. Tap the **Share** button (box with arrow at the bottom of Safari)
4. Scroll down and tap **"Add to Home Screen"**
5. The name "Kizuna" will pre-fill — tap **Add**

Kizuna now lives on your home screen. Tap it to open in full-screen mode with no browser chrome — it looks and behaves exactly like a native app. All data is stored locally on your device.

---

## Fresh start / blank database

Go to **Settings tab → Danger Zone → Reset App Data** and confirm.  
This permanently wipes all entries, flights, reminders, and the activity log.

---

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173/kizuna-app/` in your browser.

---

## If you rename the repository

Open `vite.config.js` and change the `base` field to match your repo name:

```js
base: '/your-repo-name/',
```

Also update `start_url` and `scope` in the same file to match.
