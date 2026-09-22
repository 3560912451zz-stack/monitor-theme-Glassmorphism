import { createServer } from "node:http"

const gib = 1024 ** 3

function dateAfter(months, day) {
  const now = new Date()
  const value = new Date(now.getFullYear(), now.getMonth() + months, 1, 12)
  value.setDate(Math.min(day, new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()))
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

const definitions = [
  [1, "上海 · 主节点", "CN", true, 1, "Debian GNU/Linux 12 (bookworm)", 6.8, "USD", "monthly", dateAfter(0, 30)],
  [2, "阿姆斯特丹 · 归档", "NL", false, 2, "Ubuntu 24.04 LTS", 36, "EUR", "yearly", dateAfter(4, 12)],
  [3, "洛杉矶 · 边缘 A", "US", true, 3, "Ubuntu 22.04 LTS", 4.5, "USD", "monthly", dateAfter(1, 31)],
  [4, "洛杉矶 · 边缘 B", "US", true, 4, "AlmaLinux 9", 18, "USD", "quarterly", dateAfter(2, 28)],
  [5, "东京 · 生产", "JP", true, 5, "Debian GNU/Linux 12", 980, "JPY", "monthly", dateAfter(0, 26)],
  [6, "新加坡 · 中转", "SG", true, 6, "Ubuntu 24.04 LTS", 7.2, "USD", "monthly", dateAfter(1, 15)],
  [7, "法兰克福 · 存储", "DE", true, 7, "Rocky Linux 9", 22, "EUR", "quarterly", dateAfter(3, 8)],
  [8, "平壤 · 探测 A", "KP", true, 8, "Debian GNU/Linux 11", 0, "CNY", "monthly", null],
  [9, "平壤 · 探测 B", "KP", true, 9, "Debian GNU/Linux 11", 0, "CNY", "monthly", null],
  [10, "悉尼 · 一次性", "AU", true, 10, "FreeBSD 14", 399, "CNY", "once", dateAfter(1, 20)],
  [11, "圣保罗 · 备用", "BR", false, 11, "Ubuntu 22.04 LTS", 5, "USD", "monthly", dateAfter(0, 24)],
  [12, "南极 · 科考站", "AQ", true, 12, "Alpine Linux 3.20", 0, "CNY", "monthly", null],
]

function nodes() {
  const now = Date.now() / 1000
  return definitions.map(([id, name, country, online, sort, os, price, currency, billingCycle, expiresAt]) => {
    const wave = 0.5 + 0.5 * Math.sin(Date.now() / 12_000 + Number(id))
    const memory = (2 + Number(id) % 4 * 2) * gib
    const disk = (30 + Number(id) * 10) * gib
    const metrics = online ? {
      uptime: 86_400 * (2 + Number(id)), cpu: 8 + wave * 42,
      load: [0.15 + wave, 0.12 + wave * 0.7, 0.1 + wave * 0.5],
      mem_total: memory, mem_used: memory * (0.28 + wave * 0.34),
      swap_total: gib, swap_used: gib * wave * 0.15,
      disk_total: disk, disk_used: disk * (0.22 + wave * 0.4),
      net_rx: 60_000 + wave * 4_200_000, net_tx: 30_000 + wave * 1_300_000,
      total_rx: Number(id) * 19 * gib, total_tx: Number(id) * 7 * gib,
      month_rx: Number(id) * 3 * gib, month_tx: Number(id) * 2 * gib,
      tcp: 36 + Number(id), udp: 5 + Number(id), procs: 75 + Number(id) * 3,
    } : null
    return {
      id, name, sort, public: true, online, country, last_seen: online ? now : now - Number(id) * 3200,
      metrics, os, kernel: "6.8.0-generic", arch: "x86_64", virt: "kvm",
      cpu_name: "Intel(R) Xeon(R) CPU E5-2680 v4 8-Core Processor", cpu_cores: 2 + Number(id) % 4 * 2,
      mem_total: memory, swap_total: gib, disk_total: disk, agent_version: "1.2.0",
      price, currency, billing_cycle: billingCycle, expires_at: expiresAt,
      traffic_limit: 2 * 1024 ** 4, traffic_mode: "sum", traffic_reset_day: 1,
      total_rx: Number(id) * 19 * gib, total_tx: Number(id) * 7 * gib,
      month_rx: Number(id) * 3 * gib, month_tx: Number(id) * 2 * gib,
      month_start: dateAfter(0, 1), day_rx: Number(id) * 400_000_000, day_tx: Number(id) * 160_000_000,
      hostname: `mock-${id}`, ip: `203.0.113.${id}`, remark: Number(id) === 3 ? "用于验证详情页备注和毛玻璃布局。" : "",
    }
  })
}

function history(id, hours) {
  const now = Date.now()
  const count = Math.min(180, Math.max(30, Math.round(hours * 12)))
  const metrics = []
  const ping = []
  for (let index = count - 1; index >= 0; index -= 1) {
    const ts = (now - index * hours * 3_600_000 / (count - 1)) / 1000
    const wave = 0.5 + 0.5 * Math.sin(index / 7 + id)
    metrics.push({
      ts, cpu: 9 + wave * 48, mem_used: (2 + id % 4 * 2) * gib * (0.3 + wave * 0.25),
      disk_used: (30 + id * 10) * gib * (0.26 + wave * 0.08),
      net_rx: 80_000 + wave * 5_000_000, net_tx: 30_000 + wave * 1_400_000,
    })
    ping.push({ task_id: 1, ts, latency: 24 + wave * 18, band: [20 + wave * 12, 31 + wave * 22] })
    ping.push({ task_id: 2, ts, latency: index % 29 === 0 ? null : 68 + wave * 36, loss: index % 29 === 0 ? 100 : undefined })
  }
  return { metrics, ping, probes: { 1: "上海探测", 2: "洛杉矶探测" }, loss: { 2: 3.4 } }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1")
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.setHeader("cache-control", "no-store")
  if (url.pathname === "/api/me") {
    response.end(JSON.stringify({ authed: true, github: false, site_name: "Glass Monitor", public_page: true }))
    return
  }
  if (url.pathname === "/api/nodes") {
    response.end(JSON.stringify({ nodes: nodes() }))
    return
  }
  const match = url.pathname.match(/^\/api\/nodes\/(\d+)\/metrics$/)
  if (match) {
    response.end(JSON.stringify(history(Number(match[1]), Number(url.searchParams.get("hours")) || 6)))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: "not found" }))
})

server.listen(9911, "127.0.0.1", () => {
  console.log("Monitor mock API: http://127.0.0.1:9911")
})
