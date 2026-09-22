import { useEffect, useMemo, useRef } from "react"
import type { GlobeInstance } from "globe.gl"
import type { MeshPhongMaterial, Texture } from "three"

import { getCoordByCode, normalizeCountryCode } from "@/lib/country"
import type { Node } from "@/lib/api"

type Marker = {
  id: string
  code: string
  lat: number
  lng: number
  total: number
  online: number
}

function markersFor(nodes: Node[]): Marker[] {
  const grouped = new Map<string, { total: number; online: number }>()
  for (const node of nodes) {
    const code = normalizeCountryCode(node.country)
    if (!code) continue
    const group = grouped.get(code) ?? { total: 0, online: 0 }
    group.total += 1
    if (node.online) group.online += 1
    grouped.set(code, group)
  }
  return [...grouped].flatMap(([code, group]) => {
    const coord = getCoordByCode(code)
    return coord ? [{ id: code, code, lat: coord[0], lng: coord[1], ...group }] : []
  })
}

function flagElement(value: object): HTMLElement {
  const marker = value as Marker
  const root = document.createElement("div")
  root.className = "earth-flag"
  root.title = marker.total > 1 ? `${marker.code} · ${marker.total} 个节点` : marker.code
  const image = document.createElement("img")
  image.src = `/images/flags/${marker.code}.svg`
  image.alt = marker.code
  root.append(image)
  return root
}

export function EarthGlobe({ nodes, dark, size }: { nodes: Node[]; dark: boolean; size: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const materialRef = useRef<MeshPhongMaterial | null>(null)
  const specularRef = useRef<Texture | null>(null)
  const markers = useMemo(() => markersFor(nodes), [nodes])
  const markersRef = useRef(markers)
  const darkRef = useRef(dark)

  useEffect(() => {
    markersRef.current = markers
  }, [markers])

  useEffect(() => {
    darkRef.current = dark
  }, [dark])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let observer: ResizeObserver | null = null

    const start = async () => {
      const [{ default: Globe }, THREE] = await Promise.all([import("globe.gl"), import("three")])
      if (disposed) return

      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const isDark = darkRef.current
      const globe = new Globe(host, { rendererConfig: { alpha: true, antialias: true } })
        .width(width)
        .height(height)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(isDark ? "/images/earth/earth-night.jpg" : "/images/earth/earth-blue-marble.jpg")
        .bumpImageUrl("/images/earth/earth-topology.png")
        .showAtmosphere(true)
        .atmosphereColor(isDark ? "#38bdf8" : "#60a5fa")
        .atmosphereAltitude(isDark ? 0.14 : 0.11)
        .pointsData(markersRef.current)
        .pointLat("lat")
        .pointLng("lng")
        .pointAltitude(0.008)
        .pointRadius((point: object) => (point as Marker).online > 0 ? 0.2 : 0.13)
        .pointColor((point: object) => (point as Marker).online > 0
          ? isDark ? "rgba(34,211,238,.98)" : "rgba(2,132,199,.96)"
          : isDark ? "rgba(250,204,21,.9)" : "rgba(202,138,4,.86)")
        .pointsMerge(false)
        .pointsTransitionDuration(500)
        .ringsData(markersRef.current)
        .ringLat("lat")
        .ringLng("lng")
        .ringColor(() => isDark ? "rgba(45,212,191,.32)" : "rgba(14,165,233,.26)")
        .ringMaxRadius(1.25)
        .ringPropagationSpeed(0.75)
        .ringRepeatPeriod(2500)
        .htmlElementsData(markersRef.current)
        .htmlLat("lat")
        .htmlLng("lng")
        .htmlAltitude(0.012)
        .htmlElement(flagElement)
        .htmlElementVisibilityModifier((element: HTMLElement, visible: boolean) => {
          element.style.opacity = visible ? "1" : "0"
          element.style.filter = visible ? "blur(0)" : "blur(10px)"
        })
        .htmlTransitionDuration(420)

      globeRef.current = globe
      const renderer = globe.renderer()
      renderer.setClearColor(0x000000, 0)
      renderer.domElement.style.background = "transparent"

      const material = globe.globeMaterial()
      if ("shininess" in material) {
        const phong = material as MeshPhongMaterial
        materialRef.current = phong
        phong.bumpScale = isDark ? 0.02 : 0.03
        phong.shininess = isDark ? 8 : 14
        phong.emissive.set(isDark ? 0x1e3a5f : 0x355c7d)
        phong.emissiveIntensity = isDark ? 0.48 : 0.32
        specularRef.current = new THREE.TextureLoader().load("/images/earth/earth-water.png", (texture) => {
          if (!materialRef.current) return
          materialRef.current.specularMap = texture
          materialRef.current.needsUpdate = true
        })
        phong.specular = new THREE.Color(isDark ? 0x64748b : 0x475569)
      }

      const keyLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.9 : 1)
      keyLight.position.set(1.2, 1.1, 1.6)
      const fillLight = new THREE.DirectionalLight(0xdbeafe, isDark ? 0.62 : 0.48)
      fillLight.position.set(-1.2, 0.2, 1.2)
      globe.lights([
        new THREE.AmbientLight(0xffffff, isDark ? 1.85 : 1.45),
        keyLight,
        fillLight,
      ])

      const controls = globe.controls()
      controls.autoRotate = true
      controls.autoRotateSpeed = 1.25
      controls.enableDamping = true
      controls.enableZoom = false
      controls.enablePan = false
      controls.rotateSpeed = 0.55
      globe.pointOfView({ lat: 35.8617, lng: 104.1954, altitude: 1.95 }, 0)

      observer = new ResizeObserver(([entry]) => {
        if (!entry || !globeRef.current) return
        const nextWidth = Math.max(1, Math.round(entry.contentRect.width))
        const nextHeight = Math.max(1, Math.round(entry.contentRect.height))
        globeRef.current.width(nextWidth).height(nextHeight)
        globeRef.current.renderer().setSize(nextWidth, nextHeight)
        globeRef.current.postProcessingComposer().setSize(nextWidth, nextHeight)
      })
      observer.observe(host)
    }

    void start()
    return () => {
      disposed = true
      observer?.disconnect()
      const globe = globeRef.current
      globeRef.current = null
      materialRef.current = null
      specularRef.current?.dispose()
      specularRef.current = null
      globe?._destructor()
      host.replaceChildren()
    }
  }, [])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .pointsData(markers)
      .ringsData(markers)
      .htmlElementsData(markers)
  }, [markers])

  useEffect(() => {
    const globe = globeRef.current
    const material = materialRef.current
    if (!globe || !material) return
    globe
      .globeImageUrl(dark ? "/images/earth/earth-night.jpg" : "/images/earth/earth-blue-marble.jpg")
      .atmosphereColor(dark ? "#38bdf8" : "#60a5fa")
      .atmosphereAltitude(dark ? 0.14 : 0.11)
    material.bumpScale = dark ? 0.02 : 0.03
    material.shininess = dark ? 8 : 14
    material.emissive.set(dark ? 0x1e3a5f : 0x355c7d)
    material.emissiveIntensity = dark ? 0.48 : 0.32
    material.needsUpdate = true
  }, [dark])

  return (
    <div
      ref={hostRef}
      className="earth-globe-host"
      style={{ width: size, height: size }}
      aria-label="节点国家分布地球"
    />
  )
}
