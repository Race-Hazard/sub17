import { isoFromDate } from './format'
import type { IsoDate } from './types'

export interface GpxSummary {
  distanceM: number
  durationSec: number
  startDate?: IsoDate
  pointCount: number
}

interface Point {
  lat: number
  lon: number
  time?: number
}

function haversineM(a: Point, b: Point): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Parse a GPX track into total distance and elapsed time. */
export function parseGpx(xml: string): GpxSummary {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('GPX 解析失败：文件不是有效 XML')
  }
  const nodes = Array.from(doc.getElementsByTagName('trkpt'))
  const points: Point[] = []
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'))
    const lon = Number(node.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const timeText = node.getElementsByTagName('time')[0]?.textContent
    const time = timeText ? Date.parse(timeText) : undefined
    points.push({ lat, lon, time: Number.isFinite(time) ? time : undefined })
  }
  if (points.length < 2) {
    throw new Error('GPX 里没有足够的轨迹点')
  }
  let distanceM = 0
  for (let i = 1; i < points.length; i += 1) {
    distanceM += haversineM(points[i - 1], points[i])
  }
  const times = points.map((p) => p.time).filter((t): t is number => t != null)
  const durationSec =
    times.length >= 2 && times[times.length - 1] > times[0]
      ? Math.round((times[times.length - 1] - times[0]) / 1000)
      : 0
  return {
    distanceM: Math.round(distanceM),
    durationSec,
    startDate: times.length > 0 ? isoFromDate(new Date(times[0])) : undefined,
    pointCount: points.length,
  }
}
