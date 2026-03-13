import { useMemo, useState } from "react";
import type { SiteContextResponse, VariantResponse } from "@dimensions/contracts";
import {
  buildShadowPolygon,
  clamp,
  createLocalFrame,
  formatClock,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  projectLngLat,
  projectPolygon,
  sampleShadeFraction,
  type Point2D
} from "../lib/siteAnalysis";

interface SolarStudyBoardProps {
  context: SiteContextResponse | null;
  sitePolygon: GeoJSON.Polygon | null;
  selectedVariant: VariantResponse | null;
}

interface BoardShape {
  id: string;
  label: string;
  polygon: Point2D[];
  height: number;
  fill: string;
  stroke: string;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function solarState(hour: number): { elevation: number; azimuth: number } {
  const progress = clamp((hour - 6) / 12, 0, 1);
  const elevation = Math.max(1, Math.sin(progress * Math.PI) * 74);
  const azimuth = 71 + progress * 218;
  return { elevation, azimuth };
}

function buildingPalette(kind: string | null): { fill: string; stroke: string } {
  const normalized = (kind ?? "").toLowerCase();
  if (normalized.includes("industrial") || normalized.includes("warehouse")) {
    return { fill: "#b3b9ca", stroke: "#6a7285" };
  }
  if (normalized.includes("commercial") || normalized.includes("office") || normalized.includes("retail")) {
    return { fill: "#bad1dc", stroke: "#66889d" };
  }
  return { fill: "#c9c0ad", stroke: "#7f7566" };
}

function toSvgPoint(point: Point2D, bounds: ReturnType<typeof polygonBounds>, width: number, height: number): Point2D {
  const padX = width * 0.08;
  const padY = height * 0.08;
  const scale = Math.min((width - padX * 2) / bounds.width, (height - padY * 2) / bounds.height);
  const x = padX + (point[0] - bounds.minX) * scale;
  const y = height - padY - (point[1] - bounds.minY) * scale;
  return [x, y];
}

function polygonToSvg(points: Point2D[], bounds: ReturnType<typeof polygonBounds>, width: number, height: number): string {
  return points
    .map((point) => toSvgPoint(point, bounds, width, height))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

function siteRecommendation(hour: number, sunFraction: number, shadowFraction: number): string {
  if (hour < 8.5) {
    return `Early morning: low-angle sun creates long shadows across ${formatPercent(
      shadowFraction
    )} of the lot. Reserve eastern edges for landscape or low-rise activation.`;
  }
  if (hour > 16) {
    return `Late afternoon: western edge shading rises quickly. Keep taller massing pulled back if you want evening amenity terraces.`;
  }
  if (sunFraction > 0.7) {
    return `Midday conditions are strong. This parcel has enough open sky to support a solar-first massing option with generous frontage daylight.`;
  }
  if (shadowFraction > 0.55) {
    return `Context pressure is high. Favor slimmer towers or a courtyard cutout to recover daylight without breaking FAR targets.`;
  }
  return `Balanced exposure window. Use this time band to compare podium depth and tower placement before committing to export.`;
}

export function SolarStudyBoard({ context, sitePolygon, selectedVariant }: SolarStudyBoardProps) {
  const [timeOfDay, setTimeOfDay] = useState(6.05);

  const analysis = useMemo(() => {
    if (!sitePolygon) return null;
    const frame = createLocalFrame(sitePolygon);
    const siteLocal = projectPolygon(sitePolygon, frame);
    if (siteLocal.length < 3) return null;

    const siteCenter = polygonCentroid(siteLocal);
    const contextShapes: BoardShape[] = (context?.buildings ?? [])
      .map((building) => {
        const polygon = projectPolygon(building.footprint_geojson, frame);
        const centroid = polygonCentroid(polygon);
        const distance = Math.hypot(centroid[0] - siteCenter[0], centroid[1] - siteCenter[1]);
        const palette = buildingPalette(building.building_type);
        return {
          id: `${building.osm_id}`,
          label: building.building_type ?? "Context building",
          polygon,
          height: building.height_m,
          fill: palette.fill,
          stroke: palette.stroke,
          distance
        };
      })
      .filter((shape) => shape.polygon.length >= 3)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 14)
      .map((shape) => ({
        id: shape.id,
        label: shape.label,
        polygon: shape.polygon,
        height: shape.height,
        fill: shape.fill,
        stroke: shape.stroke
      }));

    const variantShapes: BoardShape[] = (selectedVariant?.massing_params.blocks ?? [])
      .map((block, index) => {
        const polygon = Array.isArray(block.footprint_wgs84) && block.footprint_wgs84.length >= 3
          ? block.footprint_wgs84.map((point) => projectLngLat(point as Point2D, frame))
          : (block.footprint_local as Point2D[]);
        return {
          id: `${selectedVariant?.id ?? "variant"}-${index}`,
          label: block.name,
          polygon,
          height: block.height_m,
          fill: "#7bb6c8",
          stroke: "#1f6b82"
        };
      })
      .filter((shape) => shape.polygon.length >= 3);

    const bounds = polygonBounds([siteLocal, ...contextShapes.map((shape) => shape.polygon), ...variantShapes.map((shape) => shape.polygon)]);
    const { elevation, azimuth } = solarState(timeOfDay);
    const shadowPolygons = contextShapes
      .map((shape) => buildShadowPolygon(shape.polygon, shape.height, elevation, azimuth))
      .filter((shape): shape is Point2D[] => Array.isArray(shape) && shape.length >= 3);
    const shadowFraction = sampleShadeFraction(siteLocal, shadowPolygons, 24);
    const sunFraction = clamp(1 - shadowFraction, 0, 1);
    const siteAreaSqm = polygonArea(siteLocal);

    return {
      siteLocal,
      contextShapes,
      variantShapes,
      bounds,
      elevation,
      azimuth,
      shadowPolygons,
      shadowFraction,
      sunFraction,
      siteAreaSqm
    };
  }, [context, selectedVariant, sitePolygon, timeOfDay]);

  if (!analysis) {
    return (
      <section className="panel solar-board-panel">
        <div className="panel-header">
          <div>
            <h3>Sun Study Board</h3>
            <p className="panel-hint">Top-down solar readout unlocks after a site polygon is defined.</p>
          </div>
        </div>
        <div className="analysis-empty-state">
          <p>Draw a site and generate a variant to activate the board.</p>
        </div>
      </section>
    );
  }

  const width = 960;
  const height = 640;
  const siteLabelPoint = toSvgPoint(polygonCentroid(analysis.siteLocal), analysis.bounds, width, height);
  const compassRotation = analysis.azimuth - 90;

  return (
    <section className="panel solar-board-panel">
      <div className="panel-header">
        <div>
          <h3>Sun Study Board</h3>
          <p className="panel-hint">Interactive parcel exposure analysis for the currently selected option.</p>
        </div>
        <div className="board-time-readout">
          <strong>{formatClock(timeOfDay)}</strong>
          <span>Alt {Math.round(analysis.elevation)} deg</span>
        </div>
      </div>

      <div className="solar-board-shell">
        <svg viewBox={`0 0 ${width} ${height}`} className="solar-board-svg" aria-label="Solar study board">
          <rect x="0" y="0" width={width} height={height} rx="28" fill="#eae3d7" />
          <g opacity="0.36">
            {Array.from({ length: 9 }).map((_, index) => (
              <line
                key={`grid-h-${index}`}
                x1="0"
                y1={60 + index * 64}
                x2={width}
                y2={60 + index * 64}
                stroke="#d7cebf"
                strokeDasharray="6 16"
              />
            ))}
            {Array.from({ length: 10 }).map((_, index) => (
              <line
                key={`grid-v-${index}`}
                x1={72 + index * 82}
                y1="0"
                x2={72 + index * 82}
                y2={height}
                stroke="#d7cebf"
                strokeDasharray="6 16"
              />
            ))}
          </g>

          <g opacity="0.82">
            <rect x="0" y="140" width={width} height="60" fill="#d7cfc0" />
            <rect x="0" y="448" width={width} height="60" fill="#d7cfc0" />
            <rect x="208" y="0" width="54" height={height} fill="#d7cfc0" />
            <rect x="704" y="0" width="54" height={height} fill="#d7cfc0" />
          </g>

          {analysis.shadowPolygons.map((polygon, index) => (
            <polygon
              key={`shadow-${index}`}
              points={polygonToSvg(polygon, analysis.bounds, width, height)}
              fill="#8b8b74"
              opacity="0.27"
            />
          ))}

          {analysis.contextShapes.map((shape) => (
            <g key={shape.id}>
              <polygon
                points={polygonToSvg(shape.polygon, analysis.bounds, width, height)}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth="2"
              />
            </g>
          ))}

          <polygon
            points={polygonToSvg(analysis.siteLocal, analysis.bounds, width, height)}
            fill="#a8b765"
            opacity="0.95"
            stroke="#6d714d"
            strokeWidth="4"
            strokeDasharray="12 10"
          />

          {analysis.variantShapes.map((shape) => (
            <g key={shape.id}>
              <polygon
                points={polygonToSvg(shape.polygon, analysis.bounds, width, height)}
                fill={shape.fill}
                fillOpacity="0.85"
                stroke={shape.stroke}
                strokeWidth="3"
              />
              <text
                x={toSvgPoint(polygonCentroid(shape.polygon), analysis.bounds, width, height)[0]}
                y={toSvgPoint(polygonCentroid(shape.polygon), analysis.bounds, width, height)[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="board-building-label"
              >
                {Math.round(shape.height)}m
              </text>
            </g>
          ))}

          <g transform={`translate(${siteLabelPoint[0]}, ${siteLabelPoint[1]})`}>
            <text textAnchor="middle" className="board-site-title">
              {selectedVariant ? selectedVariant.typology.replaceAll("_", " ").toUpperCase() : "VACANT LOT"}
            </text>
            <text textAnchor="middle" y="28" className="board-site-subtitle">
              {Math.round(analysis.siteAreaSqm)} sqm  |  Solar window {formatPercent(analysis.sunFraction)}
            </text>
          </g>

          <g transform={`translate(${width - 110}, 90)`}>
            <circle cx="0" cy="0" r="48" fill="#ded7ca" stroke="#bcb09d" strokeWidth="2" />
            <line
              x1="0"
              y1="0"
              x2={Math.cos((compassRotation * Math.PI) / 180) * 34}
              y2={Math.sin((compassRotation * Math.PI) / 180) * 34}
              stroke="#7d633f"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="0" cy="0" r="4" fill="#7d633f" />
            <text x="0" y="-56" textAnchor="middle" className="board-compass-text">
              N
            </text>
            <text x="0" y="66" textAnchor="middle" className="board-compass-text">
              S
            </text>
            <text x="-62" y="6" textAnchor="middle" className="board-compass-text">
              W
            </text>
            <text x="62" y="6" textAnchor="middle" className="board-compass-text">
              E
            </text>
          </g>
        </svg>
      </div>

      <div className="solar-board-controls">
        <div className="time-meta">
          <span>{formatClock(timeOfDay)}</span>
          <input
            type="range"
            min="6"
            max="18"
            step="0.05"
            value={timeOfDay}
            onChange={(event) => setTimeOfDay(Number(event.target.value))}
          />
          <span>Alt {Math.round(analysis.elevation)} deg</span>
        </div>
        <div className="board-legend">
          <span><i className="legend-chip sun" /> Full sun</span>
          <span><i className="legend-chip shade" /> Shadow</span>
          <span><i className="legend-chip residential" /> Residential</span>
          <span><i className="legend-chip commercial" /> Commercial</span>
          <span><i className="legend-chip industrial" /> Industrial</span>
          <span><i className="legend-chip variant" /> Variant</span>
        </div>
      </div>

      <div className="board-metrics">
        <article className="board-metric-card">
          <strong>{formatPercent(analysis.sunFraction)}</strong>
          <span>Lot in sun</span>
        </article>
        <article className="board-metric-card">
          <strong>{formatPercent(analysis.shadowFraction)}</strong>
          <span>Lot in shade</span>
        </article>
        <article className="board-metric-card">
          <strong>{Math.round(analysis.elevation)} deg</strong>
          <span>Sun elevation</span>
        </article>
        <article className="board-metric-card">
          <strong>{Math.round(analysis.azimuth)} deg</strong>
          <span>Sun azimuth</span>
        </article>
      </div>

      <div className="board-recommendation">
        <h4>Recommendation</h4>
        <p>{siteRecommendation(timeOfDay, analysis.sunFraction, analysis.shadowFraction)}</p>
      </div>
    </section>
  );
}
