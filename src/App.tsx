import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Activity, CalendarClock, Database, LayoutGrid, List, Moon, PlugZap, Search, Star, Sun, TriangleAlert, Wrench } from "lucide-react"

import { EarthStage } from "@/components/EarthStage"
import { FinanceDialog } from "@/components/FinanceDialog"
import { NodeCard } from "@/components/NodeCard"
import { NodeList } from "@/components/NodeList"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes, type Node } from "@/lib/api"
import { countryName } from "@/lib/country"
import { daysUntil } from "@/lib/format"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }
type QuickControl = "favorite" | "totalTraffic" | "peak" | "offline" | "highLoad" | "expiring"

const QUICK_CONTROLS = [
  { key: "favorite", label: "收藏", icon: Star },
  { key: "totalTraffic", label: "总流量", icon: Database },
  { key: "peak", label: "峰值", icon: Activity },
  { key: "offline", label: "离线", icon: PlugZap },
  { key: "highLoad", label: "高负载", icon: TriangleAlert },
  { key: "expiring", label: "即将到期", icon: CalendarClock },
] as const

// Split out because recharts is most of this bundle and the list page draws no
// chart. The landing page is 242 kB rather than 629 kB (77 kB gzipped against
// 188 kB), with the rest fetched immediately after it paints.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

// `/node/{id}` is a real page: it survives a reload, can be linked to, and back
// leaves the detail view rather than the site. The hub serves index.html for any
// unknown path, so no server-side route is required.
function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    (next: number | null) => {
      history.pushState({}, "", next === null ? "/" : `/node/${next}`)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme")
    return saved ? saved === "dark" : false
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

function readFavorites(): Set<number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("monitor-theme-favorites-v1") ?? "[]")
    return new Set(Array.isArray(value) ? value.map(Number).filter(Number.isInteger) : [])
  } catch {
    return new Set()
  }
}

function readView(): "card" | "list" {
  try { return localStorage.getItem("monitor-theme-view-v1") === "list" ? "list" : "card" } catch { return "card" }
}

const EARTH_CARD_DURATION = 400
const EARTH_CARD_STAGGER = 25
const EARTH_CARD_RETURN_STAGGER = 15
const EARTH_NODE_EXIT_DELAY = 20

function clearEarthMotionItems(root: HTMLElement | null) {
  if (!root) return
  root.querySelectorAll<HTMLElement>("[data-earth-motion-item]").forEach((element) => {
    delete element.dataset.earthExitActive
    element.style.removeProperty("--earth-card-exit-delay")
    element.style.removeProperty("--earth-card-return-delay")
    element.style.removeProperty("--earth-card-exit-x")
    element.style.removeProperty("--earth-card-exit-y")
    element.style.removeProperty("--earth-card-exit-rotation")
    element.style.removeProperty("z-index")
  })
}

function prepareEarthMotion(root: HTMLElement | null) {
  if (!root) return { exitDelay: 0, returnDelay: 0 }
  clearEarthMotionItems(root)

  const viewportWidth = innerWidth
  const viewportHeight = innerHeight
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-earth-motion-item]"))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))

  candidates.forEach(({ element }) => { element.dataset.earthExitActive = "false" })
  const visible = candidates
    .filter(({ rect }) => rect.width > 0 && rect.height > 0
      && rect.bottom >= -64 && rect.top <= viewportHeight + 64
      && rect.right >= -64 && rect.left <= viewportWidth + 64)
    .sort((a, b) => Math.abs(a.rect.top - b.rect.top) > 4
      ? a.rect.top - b.rect.top : a.rect.left - b.rect.left)

  let maxExitDelay = 0
  let maxReturnDelay = 0
  const configure = (items: typeof visible, baseDelay: number, stagger: boolean) => {
    items.forEach(({ element, rect }, index) => {
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const exitsRight = centerX > viewportWidth / 2 + Math.min(96, viewportWidth * .12)
        || (Math.abs(centerX - viewportWidth / 2) <= Math.min(96, viewportWidth * .12) && index % 2 === 1)
      const exitX = exitsRight ? viewportWidth - rect.left + 32 : -(rect.right + 32)
      const exitY = Math.max(-32, Math.min(32, (centerY - viewportHeight / 2) * .08))
      const order = stagger ? Math.min(index, 12) : 0
      const returnOrder = stagger ? Math.min(items.length - 1 - index, 12) : 0
      const exitDelay = baseDelay + order * EARTH_CARD_STAGGER
      const returnDelay = returnOrder * EARTH_CARD_RETURN_STAGGER
      maxExitDelay = Math.max(maxExitDelay, exitDelay)
      maxReturnDelay = Math.max(maxReturnDelay, returnDelay)
      element.dataset.earthExitActive = "true"
      element.style.setProperty("--earth-card-exit-delay", `${exitDelay}ms`)
      element.style.setProperty("--earth-card-return-delay", `${returnDelay}ms`)
      element.style.setProperty("--earth-card-exit-x", `${exitX}px`)
      element.style.setProperty("--earth-card-exit-y", `${exitY}px`)
      element.style.setProperty("--earth-card-exit-rotation", exitsRight ? "2deg" : "-2deg")
    })
  }

  configure(visible.filter(({ element }) => element.classList.contains("summary-tile")), 0, false)

  const nodeItems = visible.filter(({ element }) => element.closest(".node-card-grid"))
  // When adjacent cards leave toward the same side, the inside card should
  // cover the outside card.  Grid siblings paint in DOM order by default,
  // which makes the fourth column cover the third; use distance from the
  // nearest edge to keep both sides visually symmetrical: 1,2,2,1.
  const columns: Array<{ left: number; items: typeof nodeItems }> = []
  nodeItems.forEach((item) => {
    const column = columns.find(({ left }) => Math.abs(left - item.rect.left) < 8)
    if (column) column.items.push(item)
    else columns.push({ left: item.rect.left, items: [item] })
  })
  columns.sort((a, b) => a.left - b.left)
  columns.forEach((column, columnIndex) => {
    const stack = 10 + Math.min(columnIndex, columns.length - 1 - columnIndex)
    column.items.forEach(({ element }) => element.style.setProperty("z-index", String(stack)))
  })
  configure(visible.filter(({ element }) => element.closest(".node-card-grid, .node-list-wrap")), EARTH_NODE_EXIT_DELAY, true)

  root.querySelectorAll<HTMLElement>(".node-toolbar [data-earth-motion-item]").forEach((element) => {
    const rect = element.getBoundingClientRect()
    const exitsRight = element.classList.contains("node-toolbar__actions")
    element.dataset.earthExitActive = "true"
    element.style.setProperty("--earth-card-exit-x", `${exitsRight ? viewportWidth - rect.left + 32 : -(rect.right + 32)}px`)
    element.style.setProperty("--earth-card-exit-y", "0px")
    element.style.setProperty("--earth-card-exit-rotation", "0deg")
    element.style.setProperty("--earth-card-exit-delay", exitsRight ? "25ms" : "0ms")
    element.style.setProperty("--earth-card-return-delay", exitsRight ? "0ms" : "15ms")
  })

  return { exitDelay: maxExitDelay, returnDelay: maxReturnDelay }
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [financeOpen, setFinanceOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [favorites, setFavorites] = useState<Set<number>>(readFavorites)
  const [quickControl, setQuickControl] = useState<QuickControl | null>(null)
  const [view, setViewState] = useState<"card" | "list">(readView)
  const [immersive, setImmersive] = useState(false)
  const [reversing, setReversing] = useState(false)
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const appShellRef = useRef<HTMLDivElement>(null)
  const earthPhaseRef = useRef<"inline" | "entering" | "immersive" | "returning">("inline")
  const earthMotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const earthMotionDelaysRef = useRef({ exitDelay: 0, returnDelay: 0 })
  const [searchOpen, setSearchOpen] = useState(false)

  const loadMe = useCallback(() => {
    // `|| "..."` because an empty message reads as no error: api() falls back to
    // res.statusText, which HTTP/2 and HTTP/3 removed, so a bodiless 502 from a
    // proxy arrives as "". The check below would then take the loading branch and
    // the retry button would never render.
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    // Warmed here rather than left to Suspense, which requests the chunk only
    // once a render reaches the detail view, itself waiting on /me. Without this
    // the split trades its first paint for a full-page skeleton over the first
    // node opened: 2.6s click-to-chart on 4G against 1.4s unsplit, 1.7s warm.
    void loadDetail()
  }, [loadMe])

  useEffect(() => {
    const syncHeader = () => setHeaderScrolled(window.scrollY > 4)
    syncHeader()
    window.addEventListener("scroll", syncHeader, { passive: true })
    return () => window.removeEventListener("scroll", syncHeader)
  }, [])

  // The status page was closed while this tab was open. `me` holds whatever it
  // reported at load, so it is re-queried; the effect below then directs an
  // anonymous visitor to the panel rather than leaving them on a list that
  // stopped updating with only a red line to explain it.
  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const sorted = useMemo(() => {
    const backendOrder = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id)
    return [...backendOrder.filter((node) => node.online), ...backendOrder.filter((node) => !node.online)]
  }, [nodes])
  const selected = sorted.find((n) => n.id === open)
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return sorted.filter((node) => {
      if (!query) return true
      return [node.name, node.country, countryName(node.country), node.os, node.arch, node.virt, node.cpu_name]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query))
    })
  }, [sorted, search])
  const quickCounts = useMemo(() => ({
    favorite: searchResults.filter((node) => favorites.has(node.id)).length,
    totalTraffic: searchResults.length,
    peak: searchResults.length,
    offline: searchResults.filter((node) => !node.online).length,
    highLoad: searchResults.filter((node) => (node.metrics?.cpu ?? 0) >= 80).length,
    expiring: searchResults.filter((node) => { const days = daysUntil(node.expires_at); return days !== null && days >= 0 && days <= 7 }).length,
  }), [searchResults, favorites])
  const filtered = useMemo(() => {
    switch (quickControl) {
      case "favorite": return searchResults.filter((node) => favorites.has(node.id))
      case "totalTraffic": return [...searchResults].sort((a, b) => b.total_rx + b.total_tx - a.total_rx - a.total_tx)
      case "peak": return [...searchResults].sort((a, b) => Math.max(b.metrics?.net_rx ?? 0, b.metrics?.net_tx ?? 0) - Math.max(a.metrics?.net_rx ?? 0, a.metrics?.net_tx ?? 0))
      case "offline": return searchResults.filter((node) => !node.online)
      case "highLoad": return searchResults.filter((node) => (node.metrics?.cpu ?? 0) >= 80)
      case "expiring": return searchResults.filter((node) => { const days = daysUntil(node.expires_at); return days !== null && days >= 0 && days <= 7 })
      default: return searchResults
    }
  }, [searchResults, quickControl, favorites])

  const setView = (next: "card" | "list") => {
    setViewState(next)
    try { localStorage.setItem("monitor-theme-view-v1", next) } catch { /* ignore blocked storage */ }
  }

  const toggleFavorite = (id: number) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem("monitor-theme-favorites-v1", JSON.stringify([...next])) } catch { /* ignore blocked storage */ }
      return next
    })
  }

  const requestEarthScene = useCallback((next: boolean) => {
    if (next === immersive) return
    const previousPhase = earthPhaseRef.current
    if (next && previousPhase === "inline")
      earthMotionDelaysRef.current = prepareEarthMotion(appShellRef.current)

    const skipStagger = next ? previousPhase === "returning" : previousPhase === "entering"
    if (earthMotionTimerRef.current) clearTimeout(earthMotionTimerRef.current)
    earthPhaseRef.current = next ? "entering" : "returning"
    setReversing(skipStagger)
    setImmersive(next)

    const delay = skipStagger ? 0 : next
      ? earthMotionDelaysRef.current.exitDelay
      : earthMotionDelaysRef.current.returnDelay
    earthMotionTimerRef.current = setTimeout(() => {
      earthPhaseRef.current = next ? "immersive" : "inline"
      setReversing(false)
      if (!next) clearEarthMotionItems(appShellRef.current)
      earthMotionTimerRef.current = null
    }, Math.max(600, EARTH_CARD_DURATION + delay) + 80)
  }, [immersive])

  useEffect(() => () => {
    if (earthMotionTimerRef.current) clearTimeout(earthMotionTimerRef.current)
    clearEarthMotionItems(appShellRef.current)
  }, [])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const interactive = target?.closest('a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [role="option"], [role="switch"], [role="tab"]')
      if (event.key === "Escape" && immersive) {
        event.preventDefault()
        requestEarthScene(false)
        return
      }
      if (event.key !== "Tab" || event.defaultPrevented || event.repeat || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || interactive || financeOpen || open !== null || innerWidth < 768 || document.querySelector('[role="dialog"][data-state="open"]')) return
      event.preventDefault()
      requestEarthScene(!immersive)
    }
    addEventListener("keydown", keydown)
    return () => removeEventListener("keydown", keydown)
  }, [financeOpen, immersive, open, requestEarthScene])

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    document.title = [selected?.name, me?.site_name || "Monitor"].filter(Boolean).join(" · ")
  }, [selected?.name, me?.site_name])

  // Only while there is nothing else to show. Once `me` has loaded, a later
  // failure belongs beside the page rather than over it.
  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  // The status page is closed and nobody is signed in: redirect to the panel.
  if (!me.public_page && !me.authed) return null

  return (
    <div ref={appShellRef} className={`app-shell min-h-svh${immersive ? " is-earth-immersive" : ""}${reversing ? " is-earth-reversing" : ""}`}>
      <header className={`site-header sticky top-0 z-10${headerScrolled ? " site-header--scrolled" : ""}`}>
        <div className="site-header__inner">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="site-brand" onClick={() => go(null)}>
            <span className="site-brand__avatar"><img src="/favicon.ico" alt="" onError={(event) => { event.currentTarget.style.display = "none" }} />{(me.site_name || "M").slice(0, 1)}</span>
            <span>{me.site_name || "Monitor"}</span>
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon-sm" className="site-header__action" onClick={toggleTheme} title="切换主题" aria-label="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Button variant="ghost" size="icon-sm" className="site-header__action" asChild>
            <a href="/admin/" title={me.authed ? "后台管理" : "登录"} aria-label={me.authed ? "后台管理" : "登录"}><Wrench /></a>
          </Button>
        </div>
      </header>

      <main className="site-main">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail node={selected} nodes={sorted} onBack={() => go(null)} onOpen={go} favorite={favorites.has(selected.id)} onToggleFavorite={() => toggleFavorite(selected.id)} />
            </Suspense>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<button className="underline" onClick={() => go(null)}>返回列表</button>
            </p>
          )
        ) : !nodes ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        ) : (
          <>
            <section className="overview-grid">
              <Summary nodes={sorted} onFinance={() => setFinanceOpen(true)} />
              <EarthStage nodes={sorted} dark={dark} immersive={immersive} onExit={() => requestEarthScene(false)} />
            </section>

            <div className="node-toolbar">
              <div className="node-toolbar__filters" data-earth-motion-item style={{ "--motion-index": 6 } as React.CSSProperties}>
                <div className="node-toolbar__tabs"><button className="is-active">全部节点</button></div>
                <div className="node-toolbar__quick">
                  {QUICK_CONTROLS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      className={quickControl === key ? "is-active" : ""}
                      aria-pressed={quickControl === key}
                      onClick={() => setQuickControl((value) => value === key ? null : key)}
                    ><Icon /><span>{label}</span><small>{quickCounts[key]}</small></button>
                  ))}
                </div>
              </div>
              <div className="node-toolbar__actions" data-earth-motion-item style={{ "--motion-index": 7 } as React.CSSProperties}>
                <button className={view === "card" ? "is-active" : ""} onClick={() => setView("card")} title="卡片视图" aria-label="卡片视图"><LayoutGrid /></button>
                <button className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} title="列表视图" aria-label="列表视图"><List /></button>
                <div className={`node-toolbar__search${searchOpen || search ? " is-open" : ""}`}>
                  <Search />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setSearchOpen(true)} onBlur={() => { if (!search) setSearchOpen(false) }} placeholder="搜索名称、地区、CPU" aria-label="搜索节点" />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : view === "list" ? (
              <NodeList nodes={filtered} favorites={favorites} onOpen={go} onToggleFavorite={toggleFavorite} />
            ) : (
              <div className="node-card-grid">
                {filtered.map((n: Node, index) => (
                  <div key={n.id} data-earth-motion-item style={{ "--motion-index": index + 8 } as React.CSSProperties}>
                    <NodeCard node={n} onOpen={() => go(n.id)} favorite={favorites.has(n.id)} onToggleFavorite={() => toggleFavorite(n.id)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <FinanceDialog open={financeOpen} nodes={nodes ?? []} onClose={() => setFinanceOpen(false)} />
    </div>
  )
}
