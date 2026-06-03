// src/lib/logger.ts
// Silences all logs in production automatically.
// Use this instead of console.log/warn/error throughout the app.

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  log:   (...args: any[]) => { if (isDev) console.log(...args) },
  warn:  (...args: any[]) => { if (isDev) console.warn(...args) },
  error: (...args: any[]) => { if (isDev) console.error(...args) },
  info:  (...args: any[]) => { if (isDev) console.info(...args) },
}