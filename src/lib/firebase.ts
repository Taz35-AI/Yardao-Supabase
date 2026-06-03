// src/lib/firebase.ts
// ⚠️ MIGRATION SHIM. The app runs on Supabase; the Firebase keys are
// intentionally absent in this isolated project. A handful of not-yet-ported
// modules (voice/Groq/push — Phase 5) still import `auth`/`db` and call
// Firestore (e.g. `collection(db, …)`) from interaction handlers. If `db` were
// null those calls throw synchronously ("Expected first argument to
// collection() to be a CollectionReference…") and crash the page.
//
// So when no real NEXT_PUBLIC_FIREBASE_* config is present we initialize
// Firebase with a harmless PLACEHOLDER config: `db`/`auth` become real (but
// inert) instances, `collection(db, …)` no longer throws, and the legacy
// Phase-5 code paths simply fail their network call quietly (they're wrapped in
// try/catch) instead of breaking the UI. Delete this file once the last
// Firebase importer is ported.
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import { logger } from '@/lib/logger'

const realConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const hasRealConfig = !!realConfig.apiKey

// Placeholder keeps the SDK happy (no format validation on these strings) so
// init never throws auth/invalid-api-key. It points at a project that doesn't
// exist — any actual Firestore/Auth network call just fails and is swallowed.
const firebaseConfig = hasRealConfig
  ? realConfig
  : {
      apiKey: 'disabled-during-supabase-migration',
      authDomain: 'disabled.firebaseapp.com',
      projectId: 'disabled',
      storageBucket: 'disabled.appspot.com',
      messagingSenderId: '0',
      appId: '1:0:web:disabled',
    }

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Only bother with persistence when there's a real project to persist against.
if (hasRealConfig && typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    logger.error('Failed to set auth persistence:', error)
  })
}

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
})

export default app
