'use client'

import { useEffect, useRef } from 'react'
// Leaflet positions every pane, tile and marker with plain CSS. Without this
// the panes stay `position: static`, so the tiles flow down the page as a pile
// of 256px squares and the marker lands a thousand pixels below the map. It
// looks like a broken map rather than a missing stylesheet, which is how it
// got shipped past a source review once already.
//
// Imported from the component and not from globals.css: a bare package path in
// a Tailwind v4 stylesheet is not resolved by the bundler and silently
// produces nothing. Here it is a module import, so it is bundled, it is never
// fetched from a CDN, and it only loads on pages that actually draw a map.
import 'leaflet/dist/leaflet.css'

// A map with one pin you can move.
//
// Every map in this app used to be a keyless Google embed: an iframe with the
// typed address pasted into ?q=. That has three problems and they are all the
// same problem. It shows wherever Google decides the string means, which for
// "calle 20 25 san jose" is a guess. You cannot correct the guess, because an
// iframe has no pin and no way to hand a coordinate back. And the directions
// link re-runs the same guess separately, so the preview and the route were
// two independent answers to one question and nothing kept them equal.
//
// So: Leaflet over OpenStreetMap tiles, no key, and the marker is draggable.
// Dragging it is the whole point. When a pin exists it is the place, and both
// the preview and the route are built from it, so what you saw is where the
// car goes.
//
// Tapping the map moves the pin too. On a phone, dragging a 25px marker with a
// thumb is the fiddliest way to say "there", and tap-to-place is what every
// other app on that phone does.

export type Point = { lat: number; lng: number }

// Mexico City, for a map that has to open somewhere before anybody has said
// anything. Better than the middle of the Atlantic, which is where 0,0 is.
const FALLBACK: Point = { lat: 19.4326, lng: -99.1332 }

export function PinMap({
  point,
  onChange,
  height = 190,
  interactive = true,
}: {
  point: Point | null
  onChange?: (p: Point) => void
  height?: number
  // a read-only preview still uses this rather than an iframe, so the dot in
  // the card is the same dot that was dropped
  interactive?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Leaflet's own types are only pulled in dynamically, so the instances are
  // held loosely rather than importing the namespace into a server bundle.
  const mapRef = useRef<{ map: unknown; marker: unknown } | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  // Read inside Leaflet's own handlers, which are registered once and outlive
  // every later render. Kept current in an effect rather than during render,
  // because a render can be thrown away and re-run.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !hostRef.current) return

      const start = point ?? FALLBACK
      const map = L.map(host, {
        center: [start.lat, start.lng],
        zoom: point ? 16 : 11,
        // The page scrolls and the map is inside it. Grabbing the wheel would
        // trap the scroll on a control most people are only looking at.
        scrollWheelZoom: false,
        dragging: interactive,
        zoomControl: interactive,
        attributionControl: true,
      })

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map)

      // The honeycomb pin, drawn rather than fetched, so there is no image to
      // 404 and it matches the rest of the app.
      const icon = L.divIcon({
        className: '',
        html:
          '<span style="display:block;width:26px;height:30px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);' +
          'background:var(--honey-500);border:2px solid var(--charcoal);box-sizing:border-box"></span>',
        iconSize: [26, 30],
        iconAnchor: [13, 30],
      })

      const marker = L.marker([start.lat, start.lng], { icon, draggable: interactive }).addTo(map)

      if (interactive) {
        marker.on('dragend', () => {
          const p = marker.getLatLng()
          onChangeRef.current?.({ lat: p.lat, lng: p.lng })
        })
        map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
          marker.setLatLng(e.latlng)
          onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng })
        })
        // Nothing has been said yet, so the map opens on the fallback and the
        // pin is not a claim about anywhere. Announcing the fallback as the
        // chosen point would save Mexico City as everyone's address.
      }

      mapRef.current = { map, marker }

      // Leaflet measures its container once, at construction, and caches that
      // size to decide which tiles to fetch and where to put them. React has
      // only just mounted this div, so that measurement lands on a box the
      // browser has not laid out yet: the map came up as a half-drawn grid of
      // squares spilling past its own edges, with the marker somewhere off the
      // visible area, which also made it impossible to grab.
      //
      // A one-shot timeout is a guess at when layout finishes. This watches
      // instead, so it is also correct when the map is inside something that
      // opens, resizes or was hidden when it mounted.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(host)
      observerRef.current = ro
    })()

    return () => {
      cancelled = true
      observerRef.current?.disconnect()
      observerRef.current = null
      const m = mapRef.current?.map as { remove?: () => void } | undefined
      m?.remove?.()
      mapRef.current = null
    }
    // Built once. Later coordinate changes move the marker below rather than
    // tearing the map down, which would fight the drag that caused them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])

  // Someone typed a new address and the geocoder answered: fly the pin there.
  useEffect(() => {
    const inst = mapRef.current
    if (!inst || !point) return
    const marker = inst.marker as { setLatLng: (p: [number, number]) => void; getLatLng: () => Point }
    const map = inst.map as { setView: (p: [number, number], z: number) => void }
    const at = marker.getLatLng()
    // Skip when this is the echo of a drag we just reported, or the map would
    // recentre under the thumb on every small move.
    if (Math.abs(at.lat - point.lat) < 1e-7 && Math.abs(at.lng - point.lng) < 1e-7) return
    marker.setLatLng([point.lat, point.lng])
    map.setView([point.lat, point.lng], 16)
  }, [point])

  // The height is fixed here rather than by a class so the container has a box
  // before Leaflet ever looks at it. A map that measures zero fetches no tiles.
  // `isolation: isolate` is load-bearing, not tidiness.
  //
  // Leaflet positions its own furniture with z-index and picks numbers on the
  // assumption that a map owns the page: the panes sit at 400, the zoom
  // buttons and the attribution at 1000. This app's whole scale tops out at
  // 140, and the tab bar is 50. With no stacking context here those numbers
  // compete in the root one, 400 beats 50, and scrolling a map to the bottom
  // of a form drew tiles, the pin and "Leaflet | © OpenStreetMap" straight
  // over the fixed tab bar.
  //
  // Isolating scopes every one of Leaflet's numbers to the inside of this box,
  // where they still order its own layers correctly and can no longer reach
  // anything else. Raising the tab bar instead would have worked until the
  // next library with an opinion about z-index.
  return <div ref={hostRef} style={{ height, isolation: 'isolate' }} className="w-full bg-cream-sunk" />
}
