import { useEffect, useRef, useState } from "react"
import {
  ArrowDown, ArrowUp, CalendarDays, Coins, Cpu, HardDrive, MemoryStick,
  Network, Star,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { api, type Node } from "@/lib/api"
import { countryName, normalizeCountryCode } from "@/lib/country"
import { bytes, CYCLES, daysUntil, FOREVER, money, percent, rate, uptime } from "@/lib/format"
import { cn } from "@/lib/utils"

type PingPoint = { task_id: number; ts: number; latency: number | null; loss?: number }
type PingPreview = { latency: number | null; loss: number | null; bars: PingPoint[] }
const pingCache = new Map<number, PingPreview>()

function monthUsage(node: Node): number {
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up": return tx
    case "down": return rx
    case "max": return Math.max(rx, tx)
    default: return rx + tx
  }
}

function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

export function osIcon(os: string) {
  const name = os.toLowerCase()
  const options: [string, string][] = [
    ["alma", "os-alma.svg"], ["ubuntu", "os-ubuntu.svg"], ["debian", "os-debian.svg"],
    ["windows", "os-windows.svg"], ["rocky", "os-rocky.svg"], ["centos", "os-centos.svg"],
    ["alpine", "os-alpine.webp"], ["arch", "os-arch.svg"], ["fedora", "os-fedora.svg"],
    ["freebsd", "os-freebsd.svg"], ["openwrt", "os-openwrt.svg"], ["proxmox", "os-proxmox.ico"],
  ]
  return `/images/logo/${options.find(([key]) => name.includes(key))?.[1] ?? "linux.svg"}`
}

function usePingPreview(id: number) {
  const element = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<PingPreview | null>(() => pingCache.get(id) ?? null)

  useEffect(() => {
    const target = element.current
    if (!target || pingCache.has(id)) return
    let active = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      api<{ ping: PingPoint[] }>(`/nodes/${id}/metrics?hours=6&points=24&series=ping`)
        .then(({ ping }) => {
          const firstProbe = ping[0]?.task_id
          const bars = ping.filter((point) => point.task_id === firstProbe).slice(-24)
          const valid = bars.filter((point) => point.latency !== null)
          const result: PingPreview = {
            latency: valid.length ? valid.reduce((sum, point) => sum + (point.latency ?? 0), 0) / valid.length : null,
            loss: bars.length ? bars.reduce((sum, point) => sum + (point.loss ?? (point.latency === null ? 100 : 0)), 0) / bars.length : null,
            bars,
          }
          pingCache.set(id, result)
          if (active) setPreview(result)
        })
        .catch(() => { /* A hub may limit history requests; keep the empty preview. */ })
    }, { rootMargin: "150px" })
    observer.observe(target)
    return () => { active = false; observer.disconnect() }
  }, [id])

  return { element, preview }
}

/** The detail list still uses these small labels, while the card uses Komari's dot and icons. */
export function Status({ node }: { node: Node }) {
  const down = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const label = node.online
    ? `在线 ${node.metrics ? uptime(node.metrics.uptime) : ""}`
    : deployed(node) ? `离线 ${down >= 60 ? uptime(down) : ""}` : "未接入"
  return (
    <Badge variant="outline" className={cn("tnum shrink-0 gap-1.5 font-normal", !node.online && "text-muted-foreground")}>
      <span className={cn("size-1.5 rounded-full", node.online ? "bg-success" : "bg-destructive")} />
      {label.trim()}
    </Badge>
  )
}

export function Country({ node }: { node: Node }) {
  const code = normalizeCountryCode(node.country)
  if (!code) return null
  return (
    <Badge variant="outline" className="shrink-0 gap-1 font-normal text-muted-foreground">
      <img src={`/images/flags/${code}.svg`} alt="" className="size-3.5 rounded-[2px] object-cover" />
      {countryName(code)}
    </Badge>
  )
}

function Metric({
  label, icon: Icon, tone, value, foot, used,
}: {
  label: string
  icon: typeof Cpu
  tone: string
  value: string
  foot: string
  used: number | null
}) {
  const pct = Math.max(0, Math.min(100, used ?? 0))
  const color = pct >= 95 ? "#f43f5e" : pct >= 80 ? "#f59e0b" : pct >= 60 ? "#0ea5e9" : "#059669"
  return (
    <div className="node-metric">
      <div className="node-metric__head">
        <span><Icon className={tone} aria-hidden="true" />{label}</span>
        <strong className="tnum">{value}</strong>
      </div>
      <div className="node-metric__track"><i style={{ width: `${pct}%`, background: color }} /></div>
      <small className="tnum" title={foot}>{foot}</small>
    </div>
  )
}

function PingPanel({ label, value, bars, loss }: { label: string; value: string; bars: PingPoint[]; loss?: boolean }) {
  const display = bars.length ? bars : Array.from({ length: 24 }, (_, i) => ({ task_id: 0, ts: i, latency: null }))
  return (
    <div className="node-ping-panel">
      <div className="node-ping-panel__head"><span>{label}</span><strong className="tnum">{value}</strong></div>
      <div className="node-ping-panel__bars">
        {display.map((point) => {
          const state = point.latency === null && bars.length ? "is-lost" : ""
          return <i key={`${point.task_id}-${point.ts}`} className={state} style={{ height: "100%", opacity: loss && point.latency !== null ? Math.max(.25, Math.min(1, (point.loss ?? 0) / 30)) : undefined }} />
        })}
      </div>
    </div>
  )
}

export function NodeCard({
  node, onOpen, favorite = false, onToggleFavorite,
}: {
  node: Node
  onOpen: () => void
  favorite?: boolean
  onToggleFavorite?: () => void
}) {
  const m = node.metrics
  const code = normalizeCountryCode(node.country)
  const days = daysUntil(node.expires_at)
  const traffic = monthUsage(node)
  const trafficPct = node.traffic_limit > 0 ? percent(traffic, node.traffic_limit) : null
  const { element, preview } = usePingPreview(node.id)

  return (
    <div
      ref={element}
      className="node-card"
      role="button"
      tabIndex={0}
      aria-label={`查看节点 ${node.name} 详情`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen() }
      }}
    >
      <div className="node-card__header">
        <span className={`node-card__status${node.online ? " is-online" : " is-offline"}`} />
        <strong className="node-card__name" title={node.name}>{node.name}</strong>
        {onToggleFavorite && (
          <button
            type="button"
            className={`node-card__favorite${favorite ? " is-favorite" : ""}`}
            aria-label={favorite ? "取消收藏" : "收藏节点"}
            onClick={(event) => { event.stopPropagation(); onToggleFavorite() }}
            onKeyDown={(event) => event.stopPropagation()}
          ><Star /></button>
        )}
        <img className="node-card__os" src={osIcon(node.os)} alt={node.os || "操作系统"} />
        {code && <img className="node-card__flag" src={`/images/flags/${code}.svg`} alt={countryName(code)} />}
      </div>

      <div className="node-card__body">
        <div className="node-card__pills">
          <span>{node.online && m ? `在线 ${Math.floor(m.uptime / 86400)} 天` : node.online ? "在线" : "离线"}</span>
          {node.price > 0 && <span>{money(node.price, node.currency)} / {CYCLES[node.billing_cycle] ?? node.billing_cycle}</span>}
        </div>

        {deployed(node) ? (
          <>
            <div className="node-card__metrics">
              <Metric label="CPU" icon={Cpu} tone="text-sky-500" value={m ? `${m.cpu.toFixed(1)}%` : "—"} used={m?.cpu ?? null} foot={m ? m.load.map((n) => n.toFixed(2)).join(", ") : "—"} />
              <Metric label="内存" icon={MemoryStick} tone="text-emerald-500" value={m ? `${percent(m.mem_used, m.mem_total).toFixed(1)}%` : "—"} used={m ? percent(m.mem_used, m.mem_total) : null} foot={m ? `${bytes(m.mem_used, 1)} / ${bytes(m.mem_total, 1)}` : bytes(node.mem_total)} />
              <Metric label="硬盘" icon={HardDrive} tone="text-orange-500" value={m ? `${percent(m.disk_used, m.disk_total).toFixed(1)}%` : "—"} used={m ? percent(m.disk_used, m.disk_total) : null} foot={m ? `${bytes(m.disk_used, 1)} / ${bytes(m.disk_total, 1)}` : bytes(node.disk_total)} />
              <Metric label="流量" icon={Network} tone="text-violet-500" value={trafficPct !== null ? `${trafficPct.toFixed(1)}%` : FOREVER} used={trafficPct} foot={`${bytes(traffic, 1)} / ${node.traffic_limit > 0 ? bytes(node.traffic_limit, 1) : FOREVER}`} />
            </div>

            <div className="node-card__triplet">
              <div><span><ArrowUp />{m ? rate(m.net_tx) : "—"}</span><span><ArrowDown />{m ? rate(m.net_rx) : "—"}</span></div>
              <div><span><ArrowUp />{bytes(node.total_tx, 1)}</span><span><ArrowDown />{bytes(node.total_rx, 1)}</span></div>
              <div><span><CalendarDays />{days === null ? "长期" : days < 0 ? "已过期" : `剩余 ${days} 天`}</span><span><Coins />{node.price > 0 ? money(node.price, node.currency) : "免费"}</span></div>
            </div>

            <div className="node-card__ping">
              <PingPanel label="延迟" value={preview?.latency === null || !preview ? "-" : `${preview.latency.toFixed(0)} ms`} bars={preview?.bars ?? []} />
              <PingPanel label="丢包" value={preview?.loss === null || !preview ? "-" : `${preview.loss.toFixed(1)}%`} bars={preview?.bars ?? []} loss />
            </div>
          </>
        ) : <p className="node-card__unconfigured">还没有接入。在后台生成安装命令并执行一次。</p>}
      </div>

      {!node.online && deployed(node) && <div className="node-card__offline-overlay"><strong>离线</strong><small>{node.last_seen ? new Date(node.last_seen * 1000).toLocaleString("zh-CN") : "尚无上报"}</small></div>}
    </div>
  )
}
