import { ArrowDownUp, Coins, Download, HardDrive, MemoryStick, Upload } from "lucide-react"

import { Card } from "@/components/ui/card"
import type { Node } from "@/lib/api"
import { DEFAULT_RATES, formatAmount, remainingValueCny } from "@/lib/finance"
import { bytes, percent, rate } from "@/lib/format"
import { cn } from "@/lib/utils"

type TileData = {
  label: string
  value: string
  detail: string
  icon: typeof MemoryStick
  action?: () => void
}
function Tile({ item, index }: { item: TileData; index: number }) {
  const Icon = item.icon
  return (
    <Card
      data-earth-motion-item
      style={{ "--motion-index": index } as React.CSSProperties}
      className={cn(
        "glass-card summary-tile gap-0 p-3",
        item.action && "cursor-pointer transition-[transform,border-color] hover:-translate-y-0.5 hover:border-sky-300/70",
      )}
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
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{item.label}</span><Icon className="size-4 opacity-55" />
      </div>
      <div className="tnum mt-2 truncate text-xl font-bold tracking-tight">{item.value}</div>
      <div className="mt-auto truncate pt-1 text-[11px] text-muted-foreground">{item.detail}</div>
    </Card>
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

  const tiles: TileData[] = [
    {
      label: "内存",
      value: memoryTotal ? `${percent(memoryUsed, memoryTotal).toFixed(1)}%` : "—",
      detail: `${bytes(memoryUsed)} / ${bytes(memoryTotal)}`,
      icon: MemoryStick,
    },
    {
      label: "硬盘",
      value: diskTotal ? `${percent(diskUsed, diskTotal).toFixed(1)}%` : "—",
      detail: `${bytes(diskUsed)} / ${bytes(diskTotal)}`,
      icon: HardDrive,
    },
    {
      label: "剩余价值",
      value: formatAmount(remaining, "CNY", DEFAULT_RATES),
      detail: "点击查看账单与月度预测",
      icon: Coins,
      action: onFinance,
    },
    {
      label: "累计流量",
      value: bytes(totalTraffic),
      detail: "全部节点上行 + 下行",
      icon: ArrowDownUp,
    },
    {
      label: "实时上行",
      value: rate(upload),
      detail: `${live.length} 个在线节点`,
      icon: Upload,
    },
    {
      label: "实时下行",
      value: rate(download),
      detail: `${live.length} 个在线节点`,
      icon: Download,
    },
  ]

  return <div className="summary-grid">{tiles.map((item, index) => <Tile key={item.label} item={item} index={index} />)}</div>
}
