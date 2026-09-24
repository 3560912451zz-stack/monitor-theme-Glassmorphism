import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { Minimize2 } from "lucide-react"

import { EarthGlobe } from "@/components/EarthGlobe"
import type { Node } from "@/lib/api"

type FrameRect = { left: number; top: number; width: number; height: number }
type MotionState = {
  kind: "enter" | "exit"
  sequence: number
  started: boolean
  from?: FrameRect
  countsFrom?: FrameRect
}

const MOTION_DURATION = 600
const MOTION_EASING = "cubic-bezier(.3,.7,.3,1)"

function viewportFrameSize() {
  return Math.max(1, Math.round(Math.min(window.innerWidth * .86, window.innerHeight * .68, 576)))
}

function rectOf(rect: DOMRect): FrameRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function flipTransform(rect: FrameRect, base: FrameRect) {
  if (base.width <= 0 || base.height <= 0) return "none"
  return `translate3d(${rect.left - base.left}px, ${rect.top - base.top}px, 0) scale(${rect.width / base.width}, ${rect.height / base.height})`
}

function inlineFrameRect(placeholder: HTMLElement): FrameRect {
  const slot = placeholder.getBoundingClientRect()
  const size = Math.min(slot.width, 448)
  return {
    left: slot.left + (slot.width - size) / 2,
    top: slot.top - 14,
    width: size,
    height: size,
  }
}

function inlineCountsRect(placeholder: HTMLElement, counts: HTMLElement): FrameRect {
  const slot = placeholder.getBoundingClientRect()
  const current = counts.getBoundingClientRect()
  const style = getComputedStyle(counts)
  const left = Number.parseFloat(style.left) || 0
  const top = Number.parseFloat(style.top) || 0
  return {
    left: slot.left + left,
    top: slot.top + top,
    width: current.width,
    height: current.height,
  }
}

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
  const placeholderRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const countsRef = useRef<HTMLDivElement>(null)
  // Keep the WebGL canvas in one DOM container for its whole lifetime. Moving
  // the portal host at the end of a transition can briefly blank the canvas.
  const [portalHost] = useState(() => document.createElement("div"))
  const animationRef = useRef<Animation | null>(null)
  const countsAnimationRef = useRef<Animation | null>(null)
  const motionRef = useRef<MotionState | null>(null)
  const sequenceRef = useRef(0)
  const previousBodyOverflowRef = useRef("")
  const previousDocumentOverflowRef = useRef("")
  const scrollLockedRef = useRef(false)
  const [detached, setDetached] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [rendererSize, setRendererSize] = useState(viewportFrameSize)

  const lockDocumentScroll = () => {
    if (scrollLockedRef.current) return
    scrollLockedRef.current = true
    previousBodyOverflowRef.current = document.body.style.overflow
    previousDocumentOverflowRef.current = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
  }

  const unlockDocumentScroll = () => {
    if (!scrollLockedRef.current) return
    document.body.style.overflow = previousBodyOverflowRef.current
    document.documentElement.style.overflow = previousDocumentOverflowRef.current
    scrollLockedRef.current = false
  }

  const cancelAnimation = () => {
    animationRef.current?.cancel()
    countsAnimationRef.current?.cancel()
    animationRef.current = null
    countsAnimationRef.current = null
  }

  useLayoutEffect(() => {
    const placeholder = placeholderRef.current
    if (!placeholder) return
    // The portal host is an intentionally movable DOM container, not UI state.
    // oxlint-disable-next-line react/immutability
    portalHost.className = "earth-stage-portal"
    placeholder.appendChild(portalHost)
    return () => portalHost.remove()
  }, [portalHost])

  useLayoutEffect(() => {
    // The host never changes parent. The fixed stage itself controls stacking;
    // the placeholder must not create a separate stacking context.
    portalHost.classList.toggle("is-detached", detached)
  }, [detached, portalHost])

  useLayoutEffect(() => {
    const placeholder = placeholderRef.current
    const stage = stageRef.current
    if (!placeholder || !stage) return
    const updateInlineScale = () => {
      const inlineSize = Math.min(placeholder.clientWidth, 448)
      stage.style.setProperty("--earth-inline-scale", String(inlineSize / rendererSize))
    }
    updateInlineScale()
    const observer = new ResizeObserver(updateInlineScale)
    observer.observe(placeholder)
    return () => observer.disconnect()
  }, [rendererSize])

  useEffect(() => {
    const onResize = () => setRendererSize(viewportFrameSize())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useLayoutEffect(() => {
    const placeholder = placeholderRef.current
    if (!placeholder) return
    const stage = stageRef.current
    const frame = frameRef.current
    if (!stage || !frame) return

    const sequence = ++sequenceRef.current
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (immersive) {
      lockDocumentScroll()

      if (!detached) {
        // Capture the inline rectangle before the fixed layout takes effect.
        cancelAnimation()
        motionRef.current = {
          kind: "enter",
          sequence,
          started: false,
          from: rectOf(frame.getBoundingClientRect()),
          countsFrom: countsRef.current ? rectOf(countsRef.current.getBoundingClientRect()) : undefined,
        }
        // A second layout pass measures the fixed endpoint.
        // oxlint-disable-next-line react/set-state-in-effect
        setDetached(true)
        setExpanded(false)
        return
      }

      const motion = motionRef.current
      if (motion?.kind === "enter" && motion.started)
        return
      const from = motion?.kind === "enter" && motion.from
        ? motion.from
        : rectOf(frame.getBoundingClientRect())
      cancelAnimation()
      motionRef.current = { kind: "enter", sequence, started: true }
      const full = rectOf(frame.getBoundingClientRect())
      setExpanded(true)

      if (reduceMotion) {
        motionRef.current = null
        return
      }

      const animation = frame.animate(
        [{ transform: flipTransform(from, full) }, { transform: "none" }],
        { duration: MOTION_DURATION, easing: MOTION_EASING, fill: "both" },
      )
      animationRef.current = animation

      const counts = countsRef.current
      const countsFrom = motion?.kind === "enter" ? motion.countsFrom : undefined
      if (counts && countsFrom) {
        const countsFull = rectOf(counts.getBoundingClientRect())
        const countsAnimation = counts.animate(
          [{ transform: flipTransform(countsFrom, countsFull) }, { transform: "none" }],
          { duration: MOTION_DURATION, easing: MOTION_EASING, fill: "both" },
        )
        countsAnimationRef.current = countsAnimation
        countsAnimation.addEventListener("finish", () => {
          if (sequence !== sequenceRef.current) return
          countsAnimation.cancel()
          countsAnimationRef.current = null
        }, { once: true })
      }
      animation.addEventListener("finish", () => {
        if (sequence !== sequenceRef.current) return
        animation.cancel()
        animationRef.current = null
        motionRef.current = null
      }, { once: true })
      return
    }

    if (!detached) {
      cancelAnimation()
      motionRef.current = null
      unlockDocumentScroll()
      return
    }

    const motion = motionRef.current
    if (motion?.kind === "exit" && motion.started)
      return

    // Keep the stage fixed until the return motion completes. Its canvas stays
    // under the same placeholder throughout the entire transition.
    const from = rectOf(frame.getBoundingClientRect())
    const counts = countsRef.current
    const countsFrom = counts ? rectOf(counts.getBoundingClientRect()) : undefined
    cancelAnimation()
    motionRef.current = { kind: "exit", sequence, started: true }
    setExpanded(false)
    const full = rectOf(frame.getBoundingClientRect())
    const inline = inlineFrameRect(placeholder)
    const countsInline = counts ? inlineCountsRect(placeholder, counts) : undefined
    let exitFinalized = false

    const finishExit = () => {
      if (exitFinalized || sequence !== sequenceRef.current) return
      exitFinalized = true
      motionRef.current = null
      // Keep the final WAAPI frame painted until React has committed the
      // inline layout. Cancelling first exposes the full-size fixed frame for
      // one paint, which looks like a second globe behind the returning cards.
      if (reduceMotion) setDetached(false)
      else flushSync(() => setDetached(false))
      cancelAnimation()
      unlockDocumentScroll()
    }

    if (reduceMotion) {
      finishExit()
      return
    }

    const animation = frame.animate(
      [
        { transform: flipTransform(from, full) },
        { transform: flipTransform(inline, full) },
      ],
      { duration: MOTION_DURATION, easing: MOTION_EASING, fill: "both" },
    )
    animationRef.current = animation

    if (counts && countsFrom && countsInline) {
      const countsAnimation = counts.animate(
        [
          { transform: flipTransform(countsFrom, countsFrom) },
          { transform: flipTransform(countsInline, countsFrom) },
        ],
        { duration: MOTION_DURATION, easing: MOTION_EASING, fill: "both" },
      )
      countsAnimationRef.current = countsAnimation
    }
    animation.addEventListener("finish", finishExit, { once: true })
    animation.addEventListener("cancel", finishExit, { once: true })
  }, [immersive, detached, rendererSize])

  useEffect(() => () => {
    ++sequenceRef.current
    cancelAnimation()
    unlockDocumentScroll()
  }, [])

  const online = nodes.filter((node) => node.online).length
  const offline = nodes.length - online
  const returning = !immersive && detached
  const stage = (
    <div
      ref={stageRef}
      className={`earth-stage${detached ? " is-detached" : ""}${returning ? " is-returning" : ""}${expanded ? " is-expanded" : ""}`}
    >
      <div ref={frameRef} className="earth-motion-frame" style={{ width: rendererSize, height: rendererSize }}>
        <EarthGlobe nodes={nodes} dark={dark} size={rendererSize} />
      </div>
      <div ref={countsRef} className="earth-counts">
        <span><i className="online" />{online}</span>
        {offline > 0 && <span><i className="offline" />{offline}</span>}
      </div>
      <button
        className="earth-exit"
        onClick={onExit}
        aria-label="退出地球沉浸模式"
        title="退出地球沉浸模式"
        tabIndex={detached ? 0 : -1}
      >
        <Minimize2 />
      </button>
    </div>
  )

  return (
    <div ref={placeholderRef} className="earth-placeholder">
      {createPortal(stage, portalHost)}
    </div>
  )
}
