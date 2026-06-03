// src/hooks/common/useFirestoreNetwork.ts
// ⚠️ Obsolete under Supabase. This used Firestore's enableNetwork/disableNetwork
// to drop the WebSocket on tab-hide for battery savings. Supabase Realtime
// channels manage their own lifecycle (our hooks remove channels on unmount),
// so this is now a no-op kept only so existing imports keep compiling. Remove
// when the Firebase dependency is dropped.
'use client'

export function useFirestoreNetwork() {
  // no-op
}
