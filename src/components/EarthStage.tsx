import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { Minimize2 } from "lucide-react"

import { EarthGlobe } from "@/components/EarthGlobe"
import type { Node } from "@/lib/api"

type Bounds = { left: number; top: number; width: number; height: number }

export function EarthStage({
  nodes,
  dark,
  immersive,
  onExit,
}: {
  nodes: Node[]
  dark: boolean
  immersive: boolean
  onExit: () => void
}) {
  const [placeholder, setPlaceholder] = useState<HTMLDivElement | null>(null)
  const [bounds, setBounds] = useState<Bounds | null>(null)

  const measure = useCallback(() => {
    if (!placeholder) return
    const rect = placeholder.getBoundingClientRect()
    setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }, [placeholder])

  useLayoutEffect(() => {
    // The fixed globe needs the placeholder's viewport rectangle before paint.
    // oxlint-disable-next-line react/set-state-in-effect
    measure()
  }, [measure])

  useEffect(() => {
    if (!placeholder) return
    const observer = new ResizeObserver(measure)
    observer.observe(placeholder)
    addEventListener("resize", measure)
    addEventListener("scroll", measure, { passive: true })
    return () => {
      observer.disconnect()
      removeEventListener("resize", measure)
      removeEventListener("scroll", measure)
    }
  }, [placeholder, measure])

  const viewport = typeof window === "undefined" ? { width: 0, height: 0 } : {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  // Komari's inline globe renders in a 28rem frame and grows to at most 36rem.
  // Keep those exact frame sizes so the real globe, not just its wrapper, follows
  // the same path during the Tab transition.
  const size = Math.max(280, Math.min(viewport.width * 0.86, viewport.height * 0.68, 576))
  const dockedBounds = bounds ? (() => {
    const dockedSize = Math.min(bounds.width, 472)
    return {
      left: bounds.left + (bounds.width - dockedSize) / 2,
      // Komari's mobile globe frame sits below its placeholder's leading edge;
      // the desktop frame overlaps it instead. Keep the summary tiles in place.
      top: bounds.top + (viewport.width <= 760 ? 9 : -14),
      width: dockedSize,
      height: dockedSize,
    }
  })() : null
  const activeBounds = immersive
    ? { left: (viewport.width - size) / 2, top: (viewport.height - size) / 2, width: size, height: size }
    : dockedBounds

  return (
    <div ref={setPlaceholder} className="earth-placeholder" aria-hidden={!activeBounds}>
      {activeBounds && (
        <div
          className={`earth-stage${immersive ? " is-immersive" : ""}`}
          style={{
            left: activeBounds.left,
            top: activeBounds.top,
            width: activeBounds.width,
            height: activeBounds.height,
            "--earth-render-scale": activeBounds.width / size,
          } as React.CSSProperties}
        >
          <EarthGlobe nodes={nodes} dark={dark} size={size} />
          <div className="earth-counts">
            <span><i className="online" />{nodes.filter((node) => node.online).length}</span>
            {nodes.some((node) => !node.online) && <span><i className="offline" />{nodes.filter((node) => !node.online).length}</span>}
          </div>
          {immersive && (
            <button className="earth-exit" onClick={onExit} aria-label="退出地球沉浸模式" title="退出地球沉浸模式">
              <Minimize2 />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
