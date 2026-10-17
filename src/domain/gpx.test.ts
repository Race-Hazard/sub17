import { describe, expect, it } from 'vitest'
import { parseGpx } from './gpx'

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Morning</name><trkseg>
    <trkpt lat="31.0000" lon="121.0000"><time>2026-10-20T07:00:00Z</time></trkpt>
    <trkpt lat="31.0010" lon="121.0000"><time>2026-10-20T07:01:00Z</time></trkpt>
    <trkpt lat="31.0020" lon="121.0000"><time>2026-10-20T07:02:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

describe('GPX import', () => {
  it('sums haversine distance and elapsed time', () => {
    const summary = parseGpx(GPX)
    expect(summary.pointCount).toBe(3)
    expect(summary.distanceM).toBeGreaterThan(200)
    expect(summary.distanceM).toBeLessThan(240)
    expect(summary.durationSec).toBe(120)
    expect(summary.startDate).toBe('2026-10-20')
  })

  it('rejects malformed or empty GPX', () => {
    expect(() => parseGpx('<not-gpx>')).toThrow()
    expect(() => parseGpx('<gpx><trk><trkseg/></trk></gpx>')).toThrow()
  })
})
