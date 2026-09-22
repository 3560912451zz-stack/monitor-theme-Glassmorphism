import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Check, CircleHelp, Coins, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Node } from "@/lib/api"
import { countryName } from "@/lib/country"
import {
  CURRENCIES,
  DEFAULT_RATES,
  formatAmount,
  formatDate,
  forecastForMonth,
  getNoRenewIds,
  isFree,
  isRecurring,
  monthInputValue,
  monthLabel,
  normalizeCurrency,
  remainingValueCny,
  setNoRenew,
  type CurrencyCode,
} from "@/lib/finance"
import { CYCLES, FOREVER, money } from "@/lib/format"

type Tab = "forecast" | "fixed" | "rates"

const RATES_KEY = "monitor-theme-finance-rates-v1"
const CURRENCY_KEY = "monitor-theme-finance-currency-v1"

function readRates(): Record<CurrencyCode, number> {
  try {
    const raw = localStorage.getItem(RATES_KEY)
    const saved = raw ? JSON.parse(raw) as Partial<Record<CurrencyCode, unknown>> : {}
    return Object.fromEntries(CURRENCIES.map((currency) => {
      const value = Number(saved[currency])
      return [currency, currency === "CNY" ? 1 : Number.isFinite(value) && value > 0 ? value : DEFAULT_RATES[currency]]
    })) as Record<CurrencyCode, number>
  } catch {
    return { ...DEFAULT_RATES }
  }
}

function readCurrency(): CurrencyCode {
  try {
    return normalizeCurrency(localStorage.getItem(CURRENCY_KEY))
  } catch {
    return "CNY"
  }
}

function monthFromDate(value: string | null): string {
  if (!value) return "未设置"
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? "日期未知" : formatDate(date)
}

function cycleLabel(node: Node): string {
  return (CYCLES[node.billing_cycle] ?? node.billing_cycle) || "周期未知"
}

export function FinanceDialog({
  open,
  nodes,
  onClose,
}: {
  open: boolean
  nodes: Node[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("forecast")
  const [month, setMonth] = useState(monthInputValue)
  const [currency, setCurrency] = useState<CurrencyCode>(readCurrency)
  const [rates, setRates] = useState(readRates)
  const [noRenewIds, setNoRenewIds] = useState<Set<number>>(getNoRenewIds)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [open, onClose])

  const paidNodes = useMemo(() => nodes.filter((node) => !isFree(node)), [nodes])
  const renewableNodes = useMemo(() => paidNodes.filter(isRecurring), [paidNodes])
  const forecast = useMemo(
    () => forecastForMonth(nodes, month, noRenewIds, rates),
    [nodes, month, noRenewIds, rates],
  )
  const forecastTotalCny = useMemo(() => forecast.reduce((sum, row) => sum + row.amountCny, 0), [forecast])
  const remainingTotalCny = useMemo(
    () => paidNodes.reduce((sum, node) => sum + remainingValueCny(node, Date.now(), rates), 0),
    [paidNodes, rates],
  )

  function updateCurrency(next: CurrencyCode) {
    setCurrency(next)
    try { localStorage.setItem(CURRENCY_KEY, next) } catch { /* ignore blocked storage */ }
  }

  function updateRate(currencyCode: CurrencyCode, raw: string) {
    if (currencyCode === "CNY") return
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    const next = { ...rates, [currencyCode]: value }
    setRates(next)
    try { localStorage.setItem(RATES_KEY, JSON.stringify(next)) } catch { /* ignore blocked storage */ }
  }

  function toggleNoRenew(id: number, checked: boolean) {
    setNoRenewIds(new Set(setNoRenew(id, checked)))
  }

  if (!open) return null

  return (
    <div
      className="finance-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="finance-dialog" role="dialog" aria-modal="true" aria-labelledby="finance-title">
        <header className="finance-dialog__header">
          <div>
            <h2 id="finance-title"><Coins className="size-5" />价值与费用明细</h2>
            <p>固定账单、月度续费预测与汇率设置</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}><X /></Button>
        </header>

        <div className="finance-dialog__totals">
          <div><span>当前剩余价值</span><strong>{formatAmount(remainingTotalCny, currency, rates)}</strong></div>
          <div><span>{monthLabel(month)}预计支出</span><strong>{formatAmount(forecastTotalCny, currency, rates)}</strong></div>
          <div><span>本月需续费</span><strong>{forecast.length} 台</strong></div>
        </div>

        <nav className="finance-tabs" aria-label="费用视图">
          {([
            ["forecast", "月度支出预估"],
            ["fixed", "固定账单"],
            ["rates", "汇率设置"],
          ] as const).map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>

        {tab === "forecast" && (
          <div className="finance-pane">
            <div className="finance-pane__toolbar">
              <div>
                <h3><CalendarClock className="size-4" />月度支出预估</h3>
                <p>只统计目标月份实际到期、且仍计划续费的机器，不把年付费用平均摊到每个月。</p>
              </div>
              <label className="finance-month">
                <span>目标月份</span>
                <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              </label>
            </div>

            <div className="finance-hint"><CircleHelp className="size-4" />“不再续费”只保存在当前浏览器，不会修改 Monitor 后台，也不会删除节点。</div>

            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead><tr><th>节点</th><th>续费日期</th><th>费用</th><th>周期</th><th>计划</th></tr></thead>
                <tbody>
                  {forecast.map((row) => (
                    <tr key={row.node.id}>
                      <td><strong>{row.node.name}</strong><small>{countryName(row.node.country)}</small></td>
                      <td>{formatDate(row.date)}</td>
                      <td className="tnum"><strong>{formatAmount(row.amountCny, currency, rates)}</strong><small>{money(row.amount, row.currency)}</small></td>
                      <td>{cycleLabel(row.node)}</td>
                      <td><span className="finance-status finance-status--planned">计划续费</span></td>
                    </tr>
                  ))}
                  {forecast.length === 0 && <tr><td colSpan={5} className="finance-empty">这个月没有需要续费的节点</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="finance-rules">
              <div className="finance-rules__title"><h3>续费计划</h3><span>标记后，该机器从这次到期起不再产生预测支出。</span></div>
              <div className="finance-rules__list">
                {renewableNodes.map((node) => {
                  const disabled = noRenewIds.has(node.id)
                  return (
                    <label key={node.id} className={disabled ? "finance-rule is-disabled" : "finance-rule"}>
                      <input type="checkbox" checked={disabled} onChange={(event) => toggleNoRenew(node.id, event.target.checked)} />
                      <span className="finance-rule__name">{node.name}</span>
                      <span className="finance-rule__expiry">{node.expires_at ? `${monthFromDate(node.expires_at)}到期` : FOREVER}</span>
                      <span className="finance-rule__action">{disabled ? "不再续费" : "继续续费"}</span>
                    </label>
                  )
                })}
                {renewableNodes.length === 0 && <p className="finance-empty">暂无需要续费的节点</p>}
              </div>
            </div>
          </div>
        )}

        {tab === "fixed" && (
          <div className="finance-pane">
            <div className="finance-pane__toolbar">
              <div><h3>固定账单明细</h3><p>沿用 Monitor 返回的价格、计费周期和到期时间。</p></div>
              <select value={currency} aria-label="显示币种" onChange={(event) => updateCurrency(normalizeCurrency(event.target.value))}>
                {CURRENCIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead><tr><th>节点</th><th>固定费用</th><th>到期</th><th>剩余价值</th></tr></thead>
                <tbody>
                  {paidNodes.map((node) => (
                    <tr key={node.id}>
                      <td><strong>{node.name}</strong><small>{countryName(node.country)}</small></td>
                      <td>{money(node.price, node.currency)} / {cycleLabel(node)}</td>
                      <td>{monthFromDate(node.expires_at)}</td>
                      <td className="tnum"><strong>{formatAmount(remainingValueCny(node), currency, rates)}</strong></td>
                    </tr>
                  ))}
                  {paidNodes.length === 0 && <tr><td colSpan={4} className="finance-empty">暂无账单节点</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "rates" && (
          <div className="finance-pane">
            <div className="finance-pane__toolbar"><div><h3>汇率设置</h3><p>仅保存在当前浏览器，不调用第三方翻译或数据服务。</p></div><span className="finance-local-badge"><Check className="size-3.5" />本地设置</span></div>
            <div className="finance-rate-grid">
              {CURRENCIES.map((item) => (
                <label key={item}><span>{item} <small>1 CNY =</small></span><input type="number" min="0" step="any" value={rates[item]} disabled={item === "CNY"} onChange={(event) => updateRate(item, event.target.value)} /></label>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
