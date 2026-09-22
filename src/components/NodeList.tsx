import { Star } from "lucide-react"

import { Country, Status } from "@/components/NodeCard"
import type { Node } from "@/lib/api"
import { bytes, daysUntil, money, percent, rate, uptime } from "@/lib/format"

function expiryText(node: Node): string {
  const days = daysUntil(node.expires_at)
  if (days === null) return "长期"
  return days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`
}

function usage(used: number, total: number): string {
  return total > 0 ? `${percent(used, total).toFixed(1)}%` : "—"
}

export function NodeList({
  nodes,
  favorites,
  onOpen,
  onToggleFavorite,
}: {
  nodes: Node[]
  favorites: Set<number>
  onOpen: (id: number) => void
  onToggleFavorite: (id: number) => void
}) {
  return (
    <div className="glass-card node-list-wrap" data-earth-motion-item style={{ "--motion-index": 1 } as React.CSSProperties}>
      <table className="node-list">
        <thead>
          <tr><th>节点</th><th>状态</th><th>CPU</th><th>内存</th><th>硬盘</th><th>实时网络</th><th>累计流量</th><th>费用 / 到期</th><th /></tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const metrics = node.metrics
            return (
              <tr key={node.id} onClick={() => onOpen(node.id)} tabIndex={0} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onOpen(node.id)}>
                <td><strong>{node.name}</strong><Country node={node} /></td>
                <td><Status node={node} /><small>{metrics ? uptime(metrics.uptime) : "无实时数据"}</small></td>
                <td className="tnum"><strong>{metrics ? `${metrics.cpu.toFixed(1)}%` : "—"}</strong><small>{node.cpu_cores} 核</small></td>
                <td className="tnum"><strong>{metrics ? usage(metrics.mem_used, metrics.mem_total) : "—"}</strong><small>{metrics ? bytes(metrics.mem_used) : bytes(node.mem_total)}</small></td>
                <td className="tnum"><strong>{metrics ? usage(metrics.disk_used, metrics.disk_total) : "—"}</strong><small>{metrics ? bytes(metrics.disk_used) : bytes(node.disk_total)}</small></td>
                <td className="tnum"><strong>↓ {metrics ? rate(metrics.net_rx) : "—"}</strong><small>↑ {metrics ? rate(metrics.net_tx) : "—"}</small></td>
                <td className="tnum"><strong>{bytes(node.total_rx + node.total_tx)}</strong><small>上下行合计</small></td>
                <td><strong>{node.price > 0 ? money(node.price, node.currency) : "免费"}</strong><small>{expiryText(node)}</small></td>
                <td>
                  <button
                    type="button"
                    className="node-favorite"
                    aria-label={favorites.has(node.id) ? "取消收藏" : "收藏节点"}
                    onClick={(event) => { event.stopPropagation(); onToggleFavorite(node.id) }}
                  >
                    <Star className={favorites.has(node.id) ? "fill-amber-400 text-amber-500" : "text-muted-foreground"} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

