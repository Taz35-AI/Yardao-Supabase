// supabase/functions/_shared/fcm.ts
// FCM HTTP v1 push sender for Edge Functions (Deno).
//
// Reads the Firebase service-account JSON from the FCM_SERVICE_ACCOUNT secret,
// mints a short-lived OAuth access token (RS256-signed JWT → token endpoint),
// and POSTs to the FCM v1 send API. The access token is cached in-memory until
// it nears expiry. If FCM_SERVICE_ACCOUNT isn't set, sendFcm() is a safe no-op
// (returns { ok:false }) so callers degrade gracefully to in-app notifications.

interface ServiceAccount {
  client_email: string
  private_key: string
  project_id: string
}

let cachedSA: ServiceAccount | null | undefined
let cachedToken: { token: string; exp: number } | null = null

function getServiceAccount(): ServiceAccount | null {
  if (cachedSA !== undefined) return cachedSA
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) { cachedSA = null; return null }
  try {
    const sa = JSON.parse(raw) as ServiceAccount
    cachedSA = sa.client_email && sa.private_key && sa.project_id ? sa : null
  } catch {
    console.error('FCM_SERVICE_ACCOUNT is not valid JSON')
    cachedSA = null
  }
  return cachedSA
}

export function fcmConfigured(): boolean {
  return getServiceAccount() !== null
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const der = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
  return der
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token
  const sa = getServiceAccount()
  if (!sa) return null

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${claim}`

  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)),
    )
    const jwt = `${signingInput}.${b64url(sig)}`

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })
    if (!resp.ok) {
      console.error('FCM token exchange failed:', resp.status, (await resp.text()).slice(0, 200))
      return null
    }
    const j = await resp.json()
    cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) }
    return cachedToken.token
  } catch (e) {
    console.error('FCM access-token error:', e instanceof Error ? e.message : e)
    return null
  }
}

export interface FcmResult { ok: boolean; invalidToken?: boolean }

/**
 * Send a push to one device token. No-op (ok:false) if FCM isn't configured.
 * `invalidToken` is true when the token is dead (UNREGISTERED / not found) so
 * the caller can clear it from the profile.
 */
export async function sendFcm(
  deviceToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<FcmResult> {
  const sa = getServiceAccount()
  if (!sa || !deviceToken) return { ok: false }
  const accessToken = await getAccessToken()
  if (!accessToken) return { ok: false }

  const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        data: data ?? {},
        android: { priority: 'HIGH', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    }),
  })

  if (resp.ok) return { ok: true }
  const txt = await resp.text()
  const invalidToken = resp.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/i.test(txt)
  console.error(`FCM send failed (${resp.status}):`, txt.slice(0, 200))
  return { ok: false, invalidToken }
}
