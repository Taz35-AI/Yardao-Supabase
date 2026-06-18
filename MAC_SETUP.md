# Yardao — Mac setup from zero (first-time Apple user)

A start-to-finish runbook: new MacBook → Apple accounts → tools → app running in
the Simulator → TestFlight for colleagues → App Store. Do the phases in order.
The two **slow** things (Xcode download, Developer Program approval) are flagged
START FIRST so they run while you do everything else.

Companion doc: `IOS_RELEASE.md` (the build/submit reference). This file is the
"from nothing" onboarding.

---

## Phase 0 — First boot of the MacBook (~20 min)

- [ ] Power on → choose language, region, connect to **Wi-Fi**.
- [ ] **Sign in with an Apple ID** when asked (or create one — see Phase 1). This
      is the *free* account (App Store, iCloud, TestFlight). It is NOT the paid
      developer account.
- [ ] Skip Siri / Screen Time / Apple Pay if you want — not needed.
- [ ] **Update macOS:**  Apple menu  → System Settings → General → **Software
      Update** → install everything, reboot. (Xcode won't install on an old macOS.)
- [ ] Find **Terminal**: press `Cmd + Space`, type "Terminal", Enter. You'll use
      it a lot — keep it in the Dock (right-click its icon → Options → Keep in Dock).

> Mac basics: `Cmd+Space` = search/launch anything. `Cmd+C/V` = copy/paste.
> The Apple menu () top-left = system stuff. Apps install by dragging to Applications.

---

## Phase 1 — Apple accounts (the important part)

There are **two** different Apple accounts — don't confuse them:

| Account | Cost | What it's for |
|---|---|---|
| **Apple ID** | Free | Sign into the Mac, App Store, iCloud, TestFlight |
| **Apple Developer Program** | £79/year | Required to build to a device, use TestFlight, and publish to the App Store |

- [ ] **Apple ID** — create at https://appleid.apple.com if you didn't during setup.
      Turn on **two-factor authentication** (required for the developer program).

- [ ] **Apple Developer Program — ENROL NOW (START FIRST, it can take hours–2 days):**
      1. Go to https://developer.apple.com/programs/enroll
      2. Sign in with your Apple ID.
      3. Choose enrolment type:
         - **Individual** — fastest (minutes–hours). Your *personal name* shows as
           the "seller" on the App Store.
         - **Organisation** — shows your *company name* as seller, but needs a free
           **D-U-N-S number** for the business and takes longer (days). Apple verifies
           the company.
      4. Pay the £79.
      > Decision: if you want **"Yardao Ltd"** (or your company) shown as the seller,
      > pick **Organisation** and request the D-U-N-S number first (it's the slow bit).
      > If you just want to ship fast and don't mind your name showing, pick
      > **Individual**. You generally can't switch later without re-enrolling, so decide now.

- [ ] While that approves, do Phases 2–4 (they don't need the developer account).

---

## Phase 2 — Install the tools (~1 hr, mostly downloads)

- [ ] **Xcode — START THIS FIRST (huge, 7–15 GB):** open the **App Store** app →
      search **Xcode** → **Get/Install**. Let it download in the background.
      When done, **open Xcode once**, accept the licence, and let it "install
      additional components."

While Xcode downloads, open **Terminal** and run these:

- [ ] **Command Line Tools** (git, compilers):
      ```bash
      xcode-select --install
      ```
- [ ] **Homebrew** (the Mac package manager — makes the rest one-liners):
      ```bash
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      ```
      After it finishes it prints two lines to "add Homebrew to your PATH" — run them.
      On Apple-Silicon Macs they look like:
      ```bash
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
      eval "$(/opt/homebrew/bin/brew shellenv)"
      ```
- [ ] **Node.js** (runs the build):
      ```bash
      brew install node
      ```
- [ ] **CocoaPods** (Capacitor's iOS dependency manager):
      ```bash
      brew install cocoapods
      ```
- [ ] **GitHub CLI** (to download the private repo):
      ```bash
      brew install gh
      gh auth login
      ```
      Choose: GitHub.com → HTTPS → "Login with a web browser" → paste the code.
- [ ] *(Optional)* **Supabase CLI** — only if you'll deploy functions from the Mac
      (you already did from Windows, so skip for now):
      ```bash
      brew install supabase/tap/supabase
      ```

Sanity check (each should print a version):
```bash
node -v && npm -v && pod --version && git --version && gh --version
```

---

## Phase 3 — Get the project (~5 min)

```bash
cd ~                 # or wherever you keep code
gh repo clone Taz35-AI/Yardao-Supabase
cd Yardao-Supabase
npm install
```

> From now on, before each build, get the latest of our work: `git pull`

---

## Phase 4 — Run it in the Simulator (the first milestone)

```bash
npm run build              # builds the web app -> out/
npx cap add ios            # ONE-TIME: creates the native ios/ project
npx cap sync ios           # copies the build + plugins into ios/
npx capacitor-assets generate --ios \
  --iconBackgroundColor '#012619' \
  --splashBackgroundColor '#ffffff' \
  --splashBackgroundColorDark '#012619'
npx cap open ios           # opens the project in Xcode
```

In **Xcode**:
- [ ] Top toolbar: pick a simulator device, e.g. **iPhone 16**.
- [ ] Press the **▶️ Run** button (or `Cmd + R`).
- [ ] The Simulator window boots and **Yardao launches inside it.** 🎉

That's the hard part done — the iOS wrapper works. Click around, check rendering.

---

## Phase 5 — Signing (needs the Developer Program to be ACTIVE)

In Xcode → click the **App** project (left) → target **App** → **Signing & Capabilities**:
- [ ] **Team:** select your Apple Developer team (appears once the program is active).
- [ ] **Bundle Identifier:** `com.yardao.app`
- [ ] **+ Capability → Push Notifications**
- [ ] **+ Capability → Background Modes** → tick **Remote notifications**
- [ ] Add the **Info.plist** usage strings (camera/photos/etc.) — copy them from
      `IOS_RELEASE.md` §3.

---

## Phase 6 — (Optional) test on a real iPhone

This is the only way to feel real performance.
- [ ] Plug your iPhone into the Mac with a cable → tap **Trust** on the phone.
- [ ] On the iPhone (iOS 16+): Settings → Privacy & Security → **Developer Mode** → on → restart.
- [ ] In Xcode, pick your iPhone from the device list → **▶️ Run**. The app installs
      on your phone.

---

## Phase 7 — TestFlight (let colleagues install before launch)

- [ ] In **App Store Connect** (https://appstoreconnect.apple.com) → **Apps → +** →
      create the app: name **Yardao**, bundle id `com.yardao.app`.
- [ ] In Xcode: top device menu → **Any iOS Device (arm64)** → **Product → Archive**.
- [ ] In the Organizer window → **Distribute App → App Store Connect → Upload**.
- [ ] Wait for it to finish processing (a few minutes) in App Store Connect →
      **TestFlight** tab.
- [ ] Add your colleagues under **Internal Testing** (by email). They install the
      free **TestFlight** app on their iPhone, accept the invite, tap **Install**.
      Internal builds need **no Apple review** — they get it within minutes, and
      every new upload updates automatically.

---

## Phase 8 — Submit to the App Store

Follow `IOS_RELEASE.md` §5–§8: screenshots, privacy policy URL, the privacy
"nutrition label", reviewer notes (demo login + account-deletion path), then
**Submit for Review**.

Prerequisites already done on the backend:
- ✅ `delete-account` + `demo-login` functions deployed; demo secrets set.
- [ ] Demo org/user created + `NEXT_PUBLIC_ENABLE_DEMO=true` in Vercel (if not yet).
- [ ] **Privacy policy page** live (you need to create this — e.g. yardao.com/privacy).

---

## Tonight's order (TL;DR)
1. Boot Mac, update macOS, sign in with Apple ID.
2. **Start the Xcode download** (App Store) **and the Developer Program enrolment** — both slow.
3. While they run: install Homebrew → node, cocoapods, gh (`gh auth login`).
4. `gh repo clone Taz35-AI/Yardao-Supabase` → `npm install`.
5. `npm run build` → `npx cap add ios` → `npx cap open ios` → **Run in Simulator**.
6. Once the program is active: signing in Xcode → Archive → TestFlight.

Get stuck on any step → screenshot it and I'll talk you through it.
