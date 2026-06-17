# Yardao — iOS / App Store release guide

Everything needed to take the existing app (Next.js static export, already wrapped
with **Capacitor**) onto the Apple App Store. You do **not** rewrite anything in
Swift — Xcode is only used to build, sign and upload.

App identity (already set in `capacitor.config.ts`): **appId `com.yardao.app`**,
**appName `Yardao`**, **webDir `out`**.

---

## 0. Before you touch the Mac (accounts)

- [ ] **Apple Developer Program** membership — £79/year (enrol at developer.apple.com). Required to sign + submit.
- [ ] Decide the **demo account** details (for App Store review) — see §6.
- [ ] Have your **privacy policy URL** ready (you have a site; e.g. `https://yardao.com/privacy`).

---

## 1. One-time setup on the Mac

```bash
# in the project folder
npm install                 # install deps (incl. Capacitor + capacitor-assets)
npm run build               # produces the static  out/  folder (webDir)
npx cap add ios             # ONE-TIME: creates the native ios/ project
npx cap sync ios            # copies web build + native plugins into ios/
```

### Generate the app icon + splash (sources already committed in `assets/`)
```bash
npx capacitor-assets generate --ios \
  --iconBackgroundColor '#012619' \
  --iconBackgroundColorDark '#012619' \
  --splashBackgroundColor '#ffffff' \
  --splashBackgroundColorDark '#012619'
```
Sources used: `assets/icon.png`, `assets/logo.png`, `assets/splash.png`,
`assets/splash-dark.png` (all already in the repo). iOS app icons must be opaque —
`capacitor-assets` flattens them onto the background colour above, so there's no
transparency for Apple to reject.

```bash
npx cap open ios            # opens the project in Xcode
```

> Re-run `npm run build && npx cap sync ios` any time you change the web app.

---

## 2. Xcode configuration (no coding — just settings)

In the **App** target → **Signing & Capabilities**:
- [ ] **Team**: select your Apple Developer team (enables automatic signing).
- [ ] **Bundle Identifier**: `com.yardao.app` (must match App Store Connect).
- [ ] **+ Capability → Push Notifications** (you use `@capacitor/push-notifications`).
- [ ] **+ Capability → Background Modes** → tick **Remote notifications**.

In **General**:
- [ ] **Display Name**: Yardao
- [ ] **Version** (e.g. `1.0.0`) and **Build** (`1`). Bump Build on every upload.
- [ ] **Minimum Deployments / iOS Deployment Target**: iOS 14.0+ (Capacitor 7 default is fine).

---

## 3. Info.plist — required usage strings

Add these to `ios/App/App/Info.plist` (Xcode → Info tab → + , or edit the file).
Apple **rejects** apps that use these APIs without a clear purpose string:

| Key | Value (suggested) |
|---|---|
| `NSCameraUsageDescription` | `Yardao uses the camera to scan vehicle registration plates and parts barcodes.` |
| `NSPhotoLibraryUsageDescription` | `Yardao needs access to your photos to attach images to vehicle and job records.` |
| `NSPhotoLibraryAddUsageDescription` | `Yardao saves exported reports and invoices to your photo library when you choose to.` |

If **Zao voice** is enabled on iOS (microphone/speech), also add:

| Key | Value |
|---|---|
| `NSMicrophoneUsageDescription` | `Yardao uses the microphone for the Zao voice assistant.` |
| `NSSpeechRecognitionUsageDescription` | `Yardao uses speech recognition to action your spoken commands.` |

(If a feature isn't actually used on iOS, omit its key rather than ship an unused permission.)

---

## 4. Supabase — deploy the back-end pieces (do this regardless of platform)

These are **server-side** and do **not** deploy via Vercel:

```bash
# Account deletion (App Store Guideline 5.1.1(v))
supabase functions deploy delete-account

# One-tap demo sign-in for the reviewer
supabase secrets set DEMO_EMAIL=demo@yardao.com DEMO_PASSWORD=<choose-a-password>
supabase functions deploy demo-login
```

Then, to reveal the **"Explore the demo"** button on the login page:
- [ ] Vercel env: `NEXT_PUBLIC_ENABLE_DEMO=true` → redeploy the web app.
- [ ] Create the **demo organisation + demo user** in Supabase and seed a little
      sample data (a few vehicles, some stock) so the reviewer sees a populated app.

Already run earlier: migrations `0042` (demo requests), `0043` (service-due),
`0044` (mileage history).

---

## 5. App Store Connect — create the listing

At appstoreconnect.apple.com → **Apps → +** :
- [ ] Platform iOS, name **Yardao**, primary language, bundle id `com.yardao.app`, SKU (any unique string).
- [ ] **Category**: Business (secondary: Productivity).
- [ ] **Screenshots** (required sizes — capture from the simulator):
  - 6.7" iPhone (1290 × 2796) — **required**
  - 6.5" iPhone (1242 × 2688)
  - 12.9" iPad (2048 × 2732) — required only if you ship for iPad
- [ ] **Description, keywords, support URL, marketing URL.**
- [ ] **Privacy Policy URL** (mandatory).

### Privacy "Nutrition Label" (App → App Privacy)
Declare honestly what Yardao collects. Typical answers for this app:

| Data type | Collected? | Linked to identity? | Used for | Tracking? |
|---|---|---|---|---|
| Contact info (name, email, phone) | Yes | Yes | App functionality | No |
| User content (vehicle/job/notes data) | Yes | Yes | App functionality | No |
| Identifiers (user ID) | Yes | Yes | App functionality | No |
| Diagnostics (crash/perf, if you add analytics) | Optional | No | App functionality | No |

- [ ] In **App Review Information**, confirm the **account-deletion** method
      (Settings → your user tab → "Delete account"). Apple specifically checks this.

---

## 6. App Review notes (paste this into "Notes" for the reviewer)

```
Yardao is a B2B vehicle-yard management tool for trade businesses.

DEMO ACCESS
Option A — tap "Explore the demo" on the login screen (one tap, no typing).
Option B — sign in manually:
  Email:    demo@yardao.com
  Password: <the DEMO_PASSWORD you set>

ACCOUNT DELETION
Settings (gear icon) → the user/account tab → "Delete account" (bottom).
Requires re-entering the password and typing DELETE.

BILLING
Subscriptions are sold to businesses via our website, not inside the app
(no in-app purchase UI). This is a B2B service used by companies.
```

---

## 7. Build & upload

In Xcode:
- [ ] Select destination **Any iOS Device (arm64)**.
- [ ] **Product → Archive**.
- [ ] In the Organizer: **Distribute App → App Store Connect → Upload**.
- [ ] Wait for processing in App Store Connect (a few minutes), then attach the
      build to your version and **Submit for Review**.

---

## 8. Rejection-avoidance checklist (the things Apple actually bounces)

- [x] **5.1.1(v) Account deletion** — in-app, implemented (`delete-account`).
- [x] **Reviewer can get past login** — demo button + creds in notes.
- [ ] **4.2 Minimum functionality** — make sure the native build genuinely uses
      device features (camera/barcode scan, push) so it's not "just a website".
      It does — keep those features visible.
- [ ] **3.1.1 Payments** — no consumer IAP UI in the iOS app; don't show prices or
      a "subscribe" button. B2B billing stays on the website.
- [ ] **2.1 Performance** — test the whole app in the simulator AND on a real
      iPhone: login, yard, check-in (camera scan), stock, invoicing, Zao. Fix any
      WebKit-specific jank before submitting.
- [ ] **Privacy** — policy URL live + nutrition label accurate.
- [ ] **Push** — APNs key created in the Apple Developer portal and wired to your
      push provider (FCM) if you want notifications working on iOS.

---

## Quick reference — rebuild loop after web changes
```bash
npm run build && npx cap sync ios && npx cap open ios
```
