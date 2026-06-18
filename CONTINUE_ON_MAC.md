# ▶️ CONTINUE ON MAC — handoff note

> Read this first. It's a handoff from the Windows Claude Code session to the
> Mac session. It captures exactly where we are, the next steps, and the
> decisions already made, so you can carry on with zero ambiguity.
> Companion docs: `MAC_SETUP.md` (zero-to-running) and `IOS_RELEASE.md` (build/submit).

## What this app is
Next.js 15 **static export** (`output: 'export'`, webDir `out`) PWA + **Supabase**
backend, wrapped with **Capacitor** for iOS/Android. `appId: com.yardao.app`,
`appName: Yardao`. Deployed to Vercel (push-to-main → auto deploy).
Supabase project ref: `gxiplydgrcjxdfrcrwcg`.

## ✅ State as of handoff (Mac)
- Homebrew installed; `node` (v26), `cocoapods`, `gh` installed; `gh auth login` done.
- Repo cloned, `npm install` done.
- **BLOCKER:** `npm run build` fails — the fresh clone has **no `.env.local`**
  (it's gitignored), so Supabase has no URL/key and the build worker exits 1.

## ▶️ IMMEDIATE NEXT STEPS (in order)

### 1. Create `.env.local` in the project root
Only TWO public vars are needed (they ship in the static bundle by design;
protected by RLS). Get the anon key from **Supabase dashboard → Project Settings
→ API → `anon` public key**, or from the Windows machine's `.env.local`, or Vercel.
```
NEXT_PUBLIC_SUPABASE_URL=https://gxiplydgrcjxdfrcrwcg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<eyJ... anon public key>
```
(Optional, only to show the demo button locally: `NEXT_PUBLIC_ENABLE_DEMO=true`.)

### 2. Build
```
npm run build
```
> If it throws cryptic NATIVE/worker errors unrelated to env, suspect **Node 26**
> (very new). Fix: `brew install node@22 && brew link --overwrite --force node@22`,
> then rebuild.

### 3. First Capacitor iOS  🎉
```
npx cap add ios          # creates ios/ (THE milestone)
npx cap sync ios
npx capacitor-assets generate --ios --iconBackgroundColor '#012619' --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#012619'
npx cap open ios         # opens Xcode
```
Then in **Xcode**: pick **iPhone 16** simulator → press **▶️ Run** → app launches
in the Simulator. (Xcode must have finished installing from the App Store first.)
If CocoaPods errors on `cap add/sync`, run `pod --version` to confirm it's installed.

## 🔑 Decisions already made (don't re-litigate)
- **Apple Developer Program: NOT paid yet** (deliberately deferred). So:
  - Simulator works now (no paid account needed).
  - **TestFlight / App Store need the paid £79/yr account** — later.
  - **Colleagues tomorrow → use the live PWA URL** (open in iPhone Safari →
    Add to Home Screen). Free, no account needed.
- Dev-account type when they DO pay: **Individual** (fast, personal name as seller)
  vs **Organisation** (existing registered company — NOT named "Yardao" — needs a
  free D-U-N-S; shows company name as seller). Undecided; user leaning on cost/speed.
- **iOS perf:** backdrop-filter is killed on iOS via a `kill-blur` class
  (head script in `layout.tsx` + rule in `globals.css`). Desktop keeps the glass.
  Next perf lever if still sluggish: virtualise the long lists (yard).

## 🗄️ Backend already done (Supabase)
- Edge functions deployed: `delete-account` (in-app account deletion, Apple 5.1.1(v))
  and `demo-login` (one-tap reviewer/guest sign-in).
- Demo secrets set: `DEMO_EMAIL` / `DEMO_PASSWORD`.
- Migrations run through `0044` (incl. service-due `0043`, mileage log `0044`).

### Still pending (not blocking the build/simulator)
- [ ] Create the **demo org + user** (`demo@yardao.com`) in Supabase + sample data
      (SQL is in the Windows chat / can be regenerated) and set
      `NEXT_PUBLIC_ENABLE_DEMO=true` in Vercel → makes the "Explore the demo"
      button appear.
- [ ] **Privacy policy page** (e.g. yardao.com/privacy) — required for submission.
- [ ] Apple Developer enrolment + payment → then signing, Info.plist usage
      strings, Archive, TestFlight, App Store (all in `IOS_RELEASE.md`).

## 🔒 Safety notes
- The two `NEXT_PUBLIC_` vars are PUBLIC (fine in `.env.local` / the bundle).
- Service-role key, DVLA/MOT/Resend/Groq keys, demo password: **server-only**,
  live in Supabase secrets — never put them in `.env.local` or the client.

## When the Mac is fully set up
Goal for the Mac session: **app running in the iOS Simulator.** Once that's done,
the user will go back to the Windows session to continue. Leave the repo clean
(commit/push anything you change), and note the macOS + Xcode versions for the record.
