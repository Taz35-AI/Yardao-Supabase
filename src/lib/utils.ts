import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// ✅ Combina clase Tailwind într-un mod sigur
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ✅ Formatează o dată sau returnează 'N/A' dacă este undefined sau invalidă
export function formatDate(date: Date | string | number | undefined): string {
  if (!date) return 'N/A'
  const d = new Date(date)
  if (isNaN(d.getTime())) return 'N/A'
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// ✅ Formatează kilometrajul sau returnează '0 km' dacă este invalid
export function formatMileage(mileage: number | string | undefined): string {
  const parsed = typeof mileage === 'string' ? parseFloat(mileage) : mileage
  if (typeof parsed !== 'number' || isNaN(parsed)) return '0 km'
  return `${parsed.toLocaleString()} km`
}

// ✅ Returnează string-ul dacă este valid, altfel returnează string gol
export function safeString(input: unknown): string {
  return typeof input === "string" ? input : ""
}
