import { ArrowDown, ArrowUp, Coins, Download, HardDrive, MemoryStick } from "lucide-react"

import type { Node } from "@/lib/api"
import { DEFAULT_RATES, formatAmount, remainingValueCny } from "@/lib/finance"
import { bytes, rate } from "@/lib/format"

type TileData = {
  label: string
  value: string
  unit?: string
  detail?: string
  icon: typeof MemoryStick
  action?: () => void
}

function splitUnit(formatted: string) {
  const firstSpace = formatted.indexOf(" ")
  return firstSpace < 0
    ? { value: formatted }
    : { value: formatted.slice(0, firstSpace), unit: formatted.slice(firstSpace + 1) }
}

function Tile({ item, index }: { item: TileData; index: number }) {
  const Icon = item.icon
  return (
    <div
      data-earth-motion-item
      style={{ "--motion-index": index } as React.CSSProperties}
      className={`summary-tile${item.action ? " summary-tile--action" : ""}`}
      role={item.action ? "button" : undefined}
      tabIndex={item.action ? 0 : undefined}
      onClick={item.action}
      onKeyDown={(event) => {
        if (item.action && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          item.action()
        }
      }}
    >
      <div className="summary-tile__top">
        <span>{item.label}</span><Icon aria-hidden="true" />
      </div>
      <div className="summary-tile__bottom tnum">
        <strong>{item.value}</strong>
        {item.unit && <span>{item.unit}</span>}
        {item.detail && <span className="summary-tile__detail">{item.detail}</span>}
      </div>
    </div>
  )
}

export function Summary({ nodes, onFinance }: { nodes: Node[]; onFinance: () => void }) {
  const live = nodes.filter((node) => node.online && node.metrics)
  const memoryUsed = live.reduce((sum, node) => sum + (node.metrics?.mem_used ?? 0), 0)
  const memoryTotal = nodes.reduce((sum, node) => sum + node.mem_total, 0)
  const diskUsed = live.reduce((sum, node) => sum + (node.metrics?.disk_used ?? 0), 0)
  const diskTotal = nodes.reduce((sum, node) => sum + node.disk_total, 0)
  const totalTraffic = nodes.reduce((sum, node) => sum + node.total_rx + node.total_tx, 0)
  const upload = live.reduce((sum, node) => sum + (node.metrics?.net_tx ?? 0), 0)
  const download = live.reduce((sum, node) => sum + (node.metrics?.net_rx ?? 0), 0)
  const remaining = nodes.reduce((sum, node) => sum + remainingValueCny(node), 0)

  // Komari's six-card order is two rows of three, with each column a pair.
  const tiles: TileData[] = [
    { label: "内存用量", ...splitUnit(bytes(memoryUsed, 1)), detail: `/ ${bytes(memoryTotal, 1)}`, icon: MemoryStick },
    { label: "剩余价值", value: formatAmount(remaining, "CNY", DEFAULT_RATES), icon: Coins, action: onFinance },
    { label: "实时上行", ...splitUnit(rate(upload)), icon: ArrowUp },
    { label: "硬盘用量", ...splitUnit(bytes(diskUsed, 1)), detail: `/ ${bytes(diskTotal, 1)}`, icon: HardDrive },
    { label: "累计流量", ...splitUnit(bytes(totalTraffic, 2)), icon: Download },
    { label: "实时下行", ...splitUnit(rate(download)), icon: ArrowDown },
  ]

  return <div className="summary-grid">{tiles.map((item, index) => <Tile key={item.label} item={item} index={index} />)}</div>
}
