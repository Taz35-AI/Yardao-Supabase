// src/lib/firebase.ts
// ⚠️ MIGRATION SHIM. The app now runs on Supabase; the Firebase keys are
// intentionally absent in this isolated project. A few not-yet-ported modules
// (voice/Groq/push — Phase 5) still import `auth`/`db` from here, so we keep the
// exports but guard initialization: with no NEXT_PUBLIC_FIREBASE_* config we
// export nulls instead of calling getAuth()/initializeFirestore(), which would
// throw `auth/invalid-api-key` and crash SSR on every page. Delete this file
// once the last Firebase importer is ported.
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import { logger } from '@/lib/logger'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const hasFirebaseConfig = !!firebaseConfig.apiKey

const app = hasFirebaseConfig
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null

// Typed as any so the legacy importers compile unchanged; they are not exercised
// on Supabase-backed paths.
export const auth: any = hasFirebaseConfig ? getAuth(app as any) : null

if (hasFirebaseConfig && typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    logger.error('Failed to set auth persistence:', error)
  })
}

export const db: any = hasFirebaseConfig
  ? initializeFirestore(app as any, { localCache: persistentLocalCache() })
  : null

export default app
