import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Coins, LayoutGrid, List, Moon, Search, Star, Sun, Wrench } from "lucide-react"

import { EarthStage } from "@/components/EarthStage"
import { FinanceDialog } from "@/components/FinanceDialog"
import { NodeCard } from "@/components/NodeCard"
import { NodeList } from "@/components/NodeList"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes, type Node } from "@/lib/api"
import { countryName } from "@/lib/country"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

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

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [financeOpen, setFinanceOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [favorites, setFavorites] = useState<Set<number>>(readFavorites)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [view, setViewState] = useState<"card" | "list">(readView)
  const [immersive, setImmersive] = useState(false)

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
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return sorted.filter((node) => {
      if (favoritesOnly && !favorites.has(node.id)) return false
      if (!query) return true
      return [node.name, node.country, countryName(node.country), node.os, node.arch, node.virt, node.cpu_name]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query))
    })
  }, [sorted, search, favoritesOnly, favorites])

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

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target?.matches("input, textarea, select, [contenteditable='true']")
      if (event.key === "Escape" && immersive) {
        event.preventDefault()
        setImmersive(false)
        return
      }
      if (event.key !== "Tab" || event.shiftKey || editing || financeOpen || open !== null || innerWidth < 768) return
      event.preventDefault()
      setImmersive((value) => !value)
    }
    addEventListener("keydown", keydown)
    return () => removeEventListener("keydown", keydown)
  }, [financeOpen, immersive, open])

  useEffect(() => {
    document.documentElement.classList.toggle("earth-immersive", immersive)
    return () => document.documentElement.classList.remove("earth-immersive")
  }, [immersive])

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
    <div className={`app-shell min-h-svh${immersive ? " is-earth-immersive" : ""}`}>
      <header className="site-header sticky top-0 z-10 border-b bg-background/60 backdrop-blur-xl" data-earth-motion-item style={{ "--motion-index": -2 } as React.CSSProperties}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            {me.site_name || "Monitor"}
          </button>
          <div className="flex-1" />
          {/* The panel is a separate app built into the hub, not part of this
              theme, so this is a navigation rather than a route. */}
          <Button variant="ghost" size="sm" onClick={() => setFinanceOpen(true)} disabled={!nodes}>
            <Coins /> 费用
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/">
              <Wrench /> {me.authed ? "进入后台" : "登录"}
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail node={selected} />
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
              <EarthStage nodes={filtered} dark={dark} immersive={immersive} onExit={() => setImmersive(false)} />
            </section>

            <div className="node-toolbar glass-card" data-earth-motion-item style={{ "--motion-index": 6 } as React.CSSProperties}>
              <label className="node-search">
                <Search />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点" />
              </label>
              <div className="node-toolbar__meta">
                <span>{filtered.length} / {sorted.length} 个节点</span>
                <span className="hidden md:inline">桌面端按 Tab 进入地球模式</span>
              </div>
              <Button variant={favoritesOnly ? "secondary" : "ghost"} size="sm" onClick={() => setFavoritesOnly((value) => !value)} title="只看收藏">
                <Star className={favoritesOnly ? "fill-amber-400 text-amber-500" : ""} /> 收藏
              </Button>
              <div className="view-toggle" aria-label="节点视图">
                <button className={view === "card" ? "active" : ""} onClick={() => setView("card")} title="卡片视图"><LayoutGrid /></button>
                <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} title="列表视图"><List /></button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : view === "list" ? (
              <NodeList nodes={filtered} favorites={favorites} onOpen={go} onToggleFavorite={toggleFavorite} />
            ) : (
              <div className="node-card-grid">
                {filtered.map((n: Node, index) => (
                  <div key={n.id} data-earth-motion-item style={{ "--motion-index": index + 7 } as React.CSSProperties}>
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
