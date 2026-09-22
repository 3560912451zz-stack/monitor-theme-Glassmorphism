import type { Node } from "@/lib/api"

export type CurrencyCode = "CNY" | "USD" | "EUR" | "GBP" | "JPY" | "HKD" | "CAD"

export const CURRENCIES: CurrencyCode[] = ["CNY", "USD", "EUR", "GBP", "JPY", "HKD", "CAD"]

/** Rates are expressed as units of the foreign currency for one CNY. */
export const DEFAULT_RATES: Record<CurrencyCode, number> = {
  CNY: 1,
  USD: 0.14,
  EUR: 0.12,
  GBP: 0.105,
  JPY: 22.2,
  HKD: 1.1,
  CAD: 0.19,
}

const SYMBOLS: Record<CurrencyCode, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  HKD: "HK$",
  CAD: "CA$",
}

const NO_RENEW_KEY = "monitor-theme-finance-no-renew-v1"

export type Renewal = {
  node: Node
  date: Date
  amountCny: number
  amount: number
  currency: string
  cycle: string
  noRenew: boolean
}

export function symbol(currency: string): string {
  return SYMBOLS[normalizeCurrency(currency)] ?? `${currency} `
}

export function normalizeCurrency(currency: string | null | undefined): CurrencyCode {
  const value = String(currency ?? "CNY").trim().toUpperCase()
  return CURRENCIES.includes(value as CurrencyCode) ? value as CurrencyCode : "CNY"
}

export function priceCny(node: Node, rates: Record<CurrencyCode, number> = DEFAULT_RATES): number {
  const price = Number(node.price)
  if (!Number.isFinite(price) || price <= 0) return 0
  const currency = normalizeCurrency(node.currency)
  const rate = Number(rates[currency])
  return currency === "CNY" ? price : rate > 0 ? price / rate : 0
}

export function formatAmount(amountCny: number, currency: CurrencyCode, rates = DEFAULT_RATES): string {
  const value = amountCny * (rates[currency] ?? 1)
  return `${symbol(currency)}${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)}`
}

export function monthInputValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number)
  return Number.isFinite(year) && Number.isFinite(month) ? `${year} 年 ${month} 月` : value
}

export function isFree(node: Node): boolean {
  return !Number.isFinite(Number(node.price)) || Number(node.price) <= 0
}

export function remainingValueCny(node: Node, now = Date.now(), rates = DEFAULT_RATES): number {
  const raw = node.expires_at
  const expiry = raw
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw).getTime()
    : NaN
  const price = priceCny(node, rates)
  if (!Number.isFinite(expiry) || expiry <= now || price <= 0) return 0
  if (node.billing_cycle === "once") return price
  const cycleDays: Record<string, number> = {
    monthly: 31,
    quarterly: 92,
    semiannual: 183,
    yearly: 365,
    biennial: 730,
    triennial: 1095,
  }
  const days = cycleDays[node.billing_cycle] ?? Number(node.billing_cycle)
  return Number.isFinite(days) && days > 0
    ? price * Math.max(0, Math.ceil((expiry - now) / 86_400_000) / days)
    : price
}

export function getNoRenewIds(): Set<number> {
  try {
    const raw = localStorage.getItem(NO_RENEW_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0))
  } catch {
    return new Set()
  }
}

export function setNoRenew(id: number, value: boolean): Set<number> {
  const ids = getNoRenewIds()
  if (value) ids.add(id)
  else ids.delete(id)
  try {
    localStorage.setItem(NO_RENEW_KEY, JSON.stringify([...ids].sort((a, b) => a - b)))
  } catch {
    // A blocked/private-storage browser should not make the finance dialog fail.
  }
  return ids
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  // Date-only values are interpreted in local time. This avoids an expiry on
  // the first day of a month moving to the previous day in western time zones.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function addMonthsFromAnchor(anchor: Date, months: number): Date {
  const originalDay = anchor.getDate()
  const next = new Date(anchor)
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  next.setDate(Math.min(originalDay, daysInMonth(next.getFullYear(), next.getMonth())))
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Monitor stores named billing cycles. Numeric cycles are accepted as a
 * defensive fallback for hubs that expose the legacy Komari day count.
 */
type BillingStep = { unit: "months" | "days"; value: number }

function billingStep(cycle: string): BillingStep | null {
  const value = String(cycle ?? "").trim().toLowerCase()
  if (!value || value === "once" || value === "one-time" || value === "one_time") return null
  const months: Record<string, number> = {
    monthly: 1,
    month: 1,
    quarterly: 3,
    quarter: 3,
    semiannual: 6,
    semi_annually: 6,
    "half-year": 6,
    yearly: 12,
    annual: 12,
    biennial: 24,
    triennial: 36,
  }
  if (months[value]) return { unit: "months", value: months[value] }
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? { unit: "days", value: days } : null
}

export function isRecurring(node: Node): boolean {
  return billingStep(node.billing_cycle) !== null
}

function monthBounds(month: string): [Date, Date] | null {
  const [year, monthNumber] = month.split("-").map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)
    return null
  return [new Date(year, monthNumber - 1, 1, 0, 0, 0, 0), new Date(year, monthNumber, 0, 23, 59, 59, 999)]
}

/**
 * Return the renewal that falls in a target calendar month. The first renewal
 * is the node's current expiry; later renewals are projected by its billing
 * cycle. A one-time plan has no projected renewal.
 */
export function renewalForMonth(
  node: Node,
  month: string,
  noRenew: boolean,
  rates: Record<CurrencyCode, number> = DEFAULT_RATES,
): Renewal | null {
  if (isFree(node) || noRenew) return null
  const bounds = monthBounds(month)
  const expiry = parseDate(node.expires_at)
  const step = billingStep(node.billing_cycle)
  // A one-time purchase has an expiry/warranty date, but never a renewal bill.
  if (!bounds || !expiry || !step) return null

  let date = expiry
  let occurrence = 0
  // A bad cycle must not lock up the UI. Four hundred years is well beyond any
  // useful dashboard forecast while still covering long-term plans.
  for (let i = 0; i < 4_800; i += 1) {
    if (date >= bounds[0] && date <= bounds[1]) {
      return {
        node,
        date,
        amountCny: priceCny(node, rates),
        amount: Number(node.price) || 0,
        currency: normalizeCurrency(node.currency),
        cycle: node.billing_cycle,
        noRenew,
      }
    }
    if (date > bounds[1]) return null
    occurrence += 1
    // Always calculate named month cycles from the original expiry. Advancing
    // from the previously clamped value turns Jan 31 -> Feb 28 -> Mar 28.
    const next = step.unit === "months"
      ? addMonthsFromAnchor(expiry, step.value * occurrence)
      : addDays(expiry, step.value * occurrence)
    if (!next || next.getTime() <= date.getTime()) return null
    date = next
  }
  return null
}

export function forecastForMonth(
  nodes: Node[],
  month: string,
  noRenewIds: Set<number>,
  rates: Record<CurrencyCode, number> = DEFAULT_RATES,
): Renewal[] {
  return nodes
    .map((node) => renewalForMonth(node, month, noRenewIds.has(node.id), rates))
    .filter((row): row is Renewal => row !== null)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}
