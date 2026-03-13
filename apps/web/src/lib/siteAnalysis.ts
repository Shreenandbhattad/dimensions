export type Point2D = [number, number];

export interface LocalFrame {
  lng: number;
  lat: number;
  metersPerLng: number;
  metersPerLat: number;
}

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const DEG_TO_RAD = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function trimClosedRing(points: Point2D[]): Point2D[] {
  if (points.length > 1) {
    const [firstX, firstY] = points[0];
    const [lastX, lastY] = points[points.length - 1];
    if (firstX === lastX && firstY === lastY) {
      return points.slice(0, -1);
    }
  }
  return points;
}

export function polygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonCentroid(points: Point2D[]): Point2D {
  if (!points.length) return [0, 0];
  const areaFactor = points.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    return sum + (x1 * y2 - x2 * y1);
  }, 0);
  if (Math.abs(areaFactor) < 1e-6) {
    const average = points.reduce(
      (acc, [x, y]) => [acc[0] + x / points.length, acc[1] + y / points.length] as Point2D,
      [0, 0]
    );
    return average;
  }
  const factor = 1 / (3 * areaFactor);
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx * factor, cy * factor];
}

export function createLocalFrame(polygon: GeoJSON.Polygon | null): LocalFrame {
  const fallback = { lng: 72.8777, lat: 19.076 };
  if (!polygon || !polygon.coordinates[0]?.length) {
    return {
      ...fallback,
      metersPerLng: 111_320 * Math.cos(fallback.lat * DEG_TO_RAD),
      metersPerLat: 110_540
    };
  }
  const ring = trimClosedRing(polygon.coordinates[0] as Point2D[]);
  const centroid = ring.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng / ring.length, lat: acc.lat + lat / ring.length }),
    { lng: 0, lat: 0 }
  );
  return {
    lng: centroid.lng,
    lat: centroid.lat,
    metersPerLng: 111_320 * Math.cos(centroid.lat * DEG_TO_RAD),
    metersPerLat: 110_540
  };
}

export function projectLngLat(point: Point2D, frame: LocalFrame): Point2D {
  const [lng, lat] = point;
  return [(lng - frame.lng) * frame.metersPerLng, (lat - frame.lat) * frame.metersPerLat];
}

export function projectPolygon(polygon: GeoJSON.Polygon, frame: LocalFrame): Point2D[] {
  return trimClosedRing((polygon.coordinates[0] as Point2D[]).map((point) => projectLngLat(point, frame)));
}

export function polygonBounds(polygons: Point2D[][]): Bounds2D {
  const allPoints = polygons.flat();
  if (!allPoints.length) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1, width: 2, height: 2 };
  }
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[prev];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function convexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort(([ax, ay], [bx, by]) => (ax === bx ? ay - by : ax - bx));
  const cross = (origin: Point2D, a: Point2D, b: Point2D) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower: Point2D[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point2D[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

export function buildShadowPolygon(
  polygon: Point2D[],
  height: number,
  elevationDeg: number,
  azimuthDeg: number
): Point2D[] | null {
  if (polygon.length < 3 || height <= 0 || elevationDeg <= 0) return null;
  const elevation = clamp(elevationDeg, 1, 89) * DEG_TO_RAD;
  const azimuth = azimuthDeg * DEG_TO_RAD;
  const length = clamp(height / Math.tan(elevation), 8, 260);
  const dx = -Math.sin(azimuth) * length;
  const dy = -Math.cos(azimuth) * length;
  return convexHull([...polygon, ...polygon.map(([x, y]) => [x + dx, y + dy] as Point2D)]);
}

export function sampleShadeFraction(sitePolygon: Point2D[], shadowPolygons: Point2D[][], grid = 22): number {
  if (!sitePolygon.length) return 0;
  const bounds = polygonBounds([sitePolygon]);
  let shaded = 0;
  let total = 0;
  for (let xIndex = 0; xIndex < grid; xIndex += 1) {
    for (let yIndex = 0; yIndex < grid; yIndex += 1) {
      const sample: Point2D = [
        bounds.minX + (bounds.width * (xIndex + 0.5)) / grid,
        bounds.minY + (bounds.height * (yIndex + 0.5)) / grid
      ];
      if (!pointInPolygon(sample, sitePolygon)) continue;
      total += 1;
      if (shadowPolygons.some((polygon) => pointInPolygon(sample, polygon))) {
        shaded += 1;
      }
    }
  }
  if (!total) return 0;
  return shaded / total;
}

export function formatClock(decimalHour: number): string {
  const totalMinutes = Math.round(decimalHour * 60);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = Math.abs(totalMinutes % 60);
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}
