import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarDays, ChevronLeft, ChevronRight,
  CircleGauge, Clock3, Cpu, CreditCard, HardDrive, MapPin,
  MemoryStick, Monitor, Network, ReceiptText, Server, Star, Wallet,
} from "lucide-react"

import { osIcon } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import { countryName, normalizeCountryCode } from "@/lib/country"
import { remainingValueCny } from "@/lib/finance"
import { bytes, cpuName, daysUntil, rate } from "@/lib/format"

type Props = {
  node: Node
  nodes: Node[]
  onBack: () => void
  onOpen: (id: number) => void
  favorite: boolean
  onToggleFavorite: () => void
}

const MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, yearly: 12,
  biennial: 24, triennial: 36,
}
const CYCLE_LABELS: Record<string, string> = {
  monthly: "月", quarterly: "季", semiannual: "半年", yearly: "年",
  biennial: "两年", triennial: "三年", once: "一次性",
}

function measure(text: string) {
  const match = text.match(/^(.*)\s(B|KB|MB|GB|TB|PB)$/)
  return { value: match?.[1] ?? text, unit: match?.[2] ?? "" }
}

function DetailMetric({
  label, value, unit, icon: Icon, good,
}: {
  label: string
  value: string
  unit?: string
  icon: typeof Cpu
  good?: boolean
}) {
  return (
    <div className="detail-metric">
      <div className="detail-metric__top"><span>{label}</span><Icon aria-hidden="true" /></div>
      <div className={`detail-metric__value${good ? " is-good" : ""}`}>
        <strong className="tnum">{value}</strong>{unit && <small>{unit}</small>}
      </div>
    </div>
  )
}

function InfoCell({ label, value, icon: Icon, image }: {
  label: string
  value: string
  icon: typeof Cpu
  image?: string
}) {
  return (
    <div className="detail-info-cell">
      <span className="detail-info-cell__label"><Icon aria-hidden="true" />{label}</span>
      <span className="detail-info-cell__value" title={value}>
        {image && <img src={image} alt="" />}{value}
      </span>
    </div>
  )
}

function InfoPanel({ title, className = "", children }: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return <section className={`detail-info-panel ${className}`}><h3>{title}</h3>{children}</section>
}

export function DetailOverview({ node, nodes, onBack, onOpen, favorite, onToggleFavorite }: Props) {
  const m = node.metrics
  const code = normalizeCountryCode(node.country)
  const index = nodes.findIndex((item) => item.id === node.id)
  const choose = (offset: number) => {
    if (nodes.length < 2 || index < 0) return
    onOpen(nodes[(index + offset + nodes.length) % nodes.length].id)
  }
  const price = node.price > 0
    ? `${node.currency || "CNY"}${node.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "免费"
  const cost = node.price <= 0
    ? "免费"
    : MONTHS[node.billing_cycle]
      ? `${node.currency || "CNY"}${(node.price / MONTHS[node.billing_cycle]).toFixed(2)}`
      : "不适用"
  const remaining = daysUntil(node.expires_at)
  const total = measure(bytes(node.total_rx + node.total_tx, 1))
  const quotaUsed = node.month_rx + node.month_tx
  const quota = node.traffic_limit > 0
    ? `${Math.min(100, quotaUsed / node.traffic_limit * 100).toFixed(1)}`
    : "∞"
  const trafficPct = node.traffic_limit > 0 ? Math.min(100, quotaUsed / node.traffic_limit * 100) : 0

  return (
    <div className="detail-overview">
      <div className="detail-heading">
        <button className="detail-heading__back" onClick={onBack} aria-label="返回首页" title="返回首页"><ArrowLeft /></button>
        {code && <img className="detail-heading__flag" src={`/images/flags/${code}.svg`} alt={countryName(code)} />}
        <div className="detail-heading__identity">
          <strong title={node.name}>{node.name}</strong>
          {code && <small><MapPin />{countryName(code)}</small>}
        </div>
        <span className={`detail-heading__status${node.online ? "" : " is-offline"}`}>{node.online ? "在线" : "离线"}</span>
        <div className="detail-heading__spacer" />
        <div className="detail-heading__switcher">
          <button onClick={onToggleFavorite} title={favorite ? "取消收藏" : "收藏节点"} aria-label={favorite ? "取消收藏当前节点" : "收藏当前节点"} className={favorite ? "is-favorite" : ""}><Star /></button>
          <button onClick={() => choose(-1)} disabled={nodes.length < 2} title="上一个节点" aria-label="上一个节点"><ChevronLeft /></button>
          <select value={node.id} aria-label="切换节点" onChange={(event) => onOpen(Number(event.target.value))}>
            {nodes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button onClick={() => choose(1)} disabled={nodes.length < 2} title="下一个节点" aria-label="下一个节点"><ChevronRight /></button>
        </div>
      </div>

      <div className="detail-metrics-grid">
        <DetailMetric label="节点价格" value={price} unit={node.price > 0 ? `/ ${CYCLE_LABELS[node.billing_cycle] ?? node.billing_cycle}` : undefined} icon={CreditCard} />
        <DetailMetric label="月均支出" value={cost} unit={MONTHS[node.billing_cycle] && node.price > 0 ? "/ 月" : undefined} icon={ReceiptText} />
        <DetailMetric label="剩余时间" value={remaining === null ? "—" : remaining < 0 ? "已过期" : remaining.toString()} unit={remaining !== null && remaining >= 0 ? "天" : undefined} icon={CalendarDays} good={remaining !== null && remaining > 30} />
        <DetailMetric label="剩余价值" value={node.price > 0 ? `¥${remainingValueCny(node).toFixed(2)}` : "无"} icon={Wallet} />
        <DetailMetric label="累计流量" value={total.value} unit={total.unit} icon={Network} />
        <DetailMetric label="流量配额" value={quota} unit={node.traffic_limit > 0 ? "%" : undefined} icon={CircleGauge} />
        <DetailMetric label="运行时间" value={m ? Math.floor(m.uptime / 86400).toString() : "—"} unit={m ? "天" : undefined} icon={Clock3} />
        <DetailMetric label="连接数" value={m ? (m.tcp + m.udp).toLocaleString("zh-CN") : "—"} icon={Server} />
      </div>

      <div className="detail-info-grid">
        <InfoPanel title="硬件信息" className="detail-info-panel--hardware">
          <div className="detail-cpu-block">
            <div className="detail-cpu-block__top"><span><Cpu />CPU</span></div>
            <div className="detail-cpu-block__name">{cpuName(node.cpu_name) || "未知处理器"} ({node.cpu_cores} vCPU)</div>
            <div className="detail-cpu-block__rating"><strong>CPU</strong><span><i style={{ width: `${Math.min(100, m?.cpu ?? 0)}%` }} /></span><small>当前使用率 {m ? `${m.cpu.toFixed(1)}%` : "—"}</small></div>
          </div>
          <div className="detail-hardware-small">
            <InfoCell label="架构" value={node.arch || "—"} icon={Monitor} />
            <InfoCell label="核心" value={`${node.cpu_cores} 核`} icon={Cpu} />
            <InfoCell label="虚拟化" value={node.virt || "—"} icon={Server} />
          </div>
        </InfoPanel>

        <InfoPanel title="系统信息" className="detail-info-panel--system">
          <div className="detail-system-grid">
            <InfoCell label="操作系统" value={node.os || "—"} icon={Monitor} image={osIcon(node.os)} />
            <InfoCell label="内核版本" value={node.kernel || "—"} icon={Server} />
            <InfoCell label="运行时间" value={m ? `${Math.floor(m.uptime / 86400)} 天` : "—"} icon={Clock3} />
            <InfoCell label="厂商" value="—" icon={Server} />
          </div>
        </InfoPanel>

        <InfoPanel title="存储信息" className="detail-info-panel--storage">
          <div className="detail-storage-grid">
            <InfoCell label="内存" value={bytes(node.mem_total, 1)} icon={MemoryStick} />
            <InfoCell label="内存交换" value={bytes(node.swap_total, 1)} icon={MemoryStick} />
            <InfoCell label="硬盘" value={bytes(node.disk_total, 1)} icon={HardDrive} />
          </div>
        </InfoPanel>

        <InfoPanel title="网络信息" className="detail-info-panel--network">
          <div className="detail-network-grid">
            <div className="detail-network-traffic">
              {node.traffic_limit > 0 && <i className="detail-network-traffic__fill" style={{ width: `${trafficPct}%` }} />}
              <div className="detail-network-traffic__content">
                <div className="detail-network-traffic__top"><span><Network />总流量</span><small>↑ {bytes(node.total_tx, 1)} / ↓ {bytes(node.total_rx, 1)}</small></div>
                <span>{bytes(quotaUsed, 1)} / {node.traffic_limit > 0 ? bytes(node.traffic_limit, 1) : "无限流量"}</span>
              </div>
            </div>
            <div className="detail-network-speed"><span><CircleGauge />网络速率</span><strong><ArrowUp />{m ? rate(m.net_tx) : "—"}<ArrowDown />{m ? rate(m.net_rx) : "—"}</strong></div>
          </div>
        </InfoPanel>
      </div>
    </div>
  )
}
