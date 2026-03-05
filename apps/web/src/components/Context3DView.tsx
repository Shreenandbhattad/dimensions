import { FlyToInterpolator } from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { PolygonLayer } from "@deck.gl/layers";
import { useEffect, useMemo, useState } from "react";
import Map from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { SiteContextResponse, VariantResponse } from "@dimensions/contracts";
import { HqVariantPreview } from "./HqVariantPreview";

interface Context3DViewProps {
  context: SiteContextResponse | null;
  sitePolygon: GeoJSON.Polygon | null;
  selectedVariant: VariantResponse | null;
}

type MapPolygonFeature = {
  polygon: number[][];
  height: number;
  color: [number, number, number, number];
  lineColor?: [number, number, number, number];
};

export function Context3DView({ context, sitePolygon, selectedVariant }: Context3DViewProps) {
  const [viewState, setViewState] = useState({
    longitude: 72.8777,
    latitude: 19.076,
    zoom: 14.8,
    pitch: 52,
    bearing: -12,
    transitionDuration: 0,
    transitionInterpolator: undefined as FlyToInterpolator | undefined
  });
  const [showContextBuildings, setShowContextBuildings] = useState(true);
  const [showSiteBoundary, setShowSiteBoundary] = useState(true);
  const [showSiteHalo, setShowSiteHalo] = useState(true);
  const [showVariantMassing, setShowVariantMassing] = useState(true);
  const [viewerMode, setViewerMode] = useState<"urban" | "studio">("urban");
  const [metricMode, setMetricMode] = useState<"solar_access" | "daylight_factor" | "shadow_impact">(
    "solar_access"
  );

  const metricColor = useMemo<[number, number, number, number]>(() => {
    if (!selectedVariant) {
      return [10, 132, 255, 190];
    }
    const metricValue = selectedVariant.scores[metricMode];
    if (metricMode === "shadow_impact") {
      const cool = Math.round(70 + (1 - metricValue) * 130);
      const warm = Math.round(80 + metricValue * 140);
      return [warm, cool, 90, 210];
    }
    const red = Math.round(220 - metricValue * 130);
    const green = Math.round(80 + metricValue * 145);
    const blue = Math.round(90 + metricValue * 120);
    return [red, green, blue, 210];
  }, [metricMode, selectedVariant]);

  useEffect(() => {
    if (!sitePolygon || sitePolygon.coordinates[0].length < 4) return;
    const points = sitePolygon.coordinates[0];
    const xs = points.map(([lng]) => lng);
    const ys = points.map(([, lat]) => lat);
    const centerLng = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerLat = (Math.min(...ys) + Math.max(...ys)) / 2;
    setViewState((current) => ({
      ...current,
      longitude: centerLng,
      latitude: centerLat,
      zoom: 15.2,
      pitch: 54,
      bearing: -16,
      transitionDuration: 950,
      transitionInterpolator: new FlyToInterpolator()
    }));
  }, [sitePolygon]);

  useEffect(() => {
    if (!selectedVariant) return;
    setViewState((current) => ({
      ...current,
      pitch: 58,
      bearing: -20,
      transitionDuration: 700,
      transitionInterpolator: new FlyToInterpolator()
    }));
  }, [selectedVariant]);

  const buildingData = useMemo<MapPolygonFeature[]>(() => {
    if (!context) return [];
    return context.buildings.map((building) => ({
      polygon: building.footprint_geojson.coordinates[0].map(([lng, lat]) => [lng, lat]),
      height: building.height_m,
      color: [90 + Math.min(90, Math.round(building.height_m * 1.4)), 132, 154, 185],
      lineColor: [58, 70, 86, 210]
    }));
  }, [context]);

  const siteData = useMemo<MapPolygonFeature[]>(() => {
    if (!sitePolygon) return [];
    return [
      {
        polygon: sitePolygon.coordinates[0].map(([lng, lat]) => [lng, lat]),
        height: 1.5,
        color: [14, 116, 144, 170],
        lineColor: [4, 78, 117, 255]
      }
    ];
  }, [sitePolygon]);

  const siteHaloData = useMemo<MapPolygonFeature[]>(() => {
    if (!sitePolygon) return [];
    const points = sitePolygon.coordinates[0];
    if (points.length < 4) return [];
    const centroid = points.reduce(
      (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
      { lng: 0, lat: 0 }
    );
    const centerLng = centroid.lng / points.length;
    const centerLat = centroid.lat / points.length;
    const expanded = points.map(([lng, lat]) => {
      const dx = lng - centerLng;
      const dy = lat - centerLat;
      return [centerLng + dx * 1.02, centerLat + dy * 1.02];
    });
    return [
      {
        polygon: expanded,
        height: 0.1,
        color: [245, 158, 11, 70],
        lineColor: [245, 158, 11, 175]
      }
    ];
  }, [sitePolygon]);

  const variantData = useMemo<MapPolygonFeature[]>(() => {
    if (!selectedVariant) return [];
    return selectedVariant.massing_params.blocks
      .map((block) => block.footprint_wgs84)
      .filter((coords): coords is number[][] => Array.isArray(coords) && coords.length > 2)
      .map((coords, index) => ({
        polygon: coords,
        height: selectedVariant.massing_params.blocks[index].height_m,
        color: metricColor,
        lineColor: [15, 52, 91, 255]
      }));
  }, [metricColor, selectedVariant]);

  const layers = useMemo(() => {
    const stack: PolygonLayer<MapPolygonFeature>[] = [];
    if (showContextBuildings) {
      stack.push(
        new PolygonLayer<MapPolygonFeature>({
          id: "context-buildings",
          data: buildingData,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => d.height,
          getFillColor: (d) => d.color,
          getLineColor: (d) => d.lineColor ?? [58, 70, 86, 220],
          opacity: 0.95,
          extruded: true,
          stroked: true,
          wireframe: false,
          pickable: false,
          transitions: {
            getElevation: 450,
            getFillColor: 450
          }
        })
      );
    }
    if (showSiteHalo) {
      stack.push(
        new PolygonLayer<MapPolygonFeature>({
          id: "site-halo",
          data: siteHaloData,
          getPolygon: (d) => d.polygon,
          getElevation: () => 0.2,
          getFillColor: (d) => d.color,
          getLineColor: (d) => d.lineColor ?? [245, 158, 11, 175],
          extruded: true,
          stroked: true,
          wireframe: false,
          lineWidthMinPixels: 2,
          pickable: false
        })
      );
    }
    if (showSiteBoundary) {
      stack.push(
        new PolygonLayer<MapPolygonFeature>({
          id: "site-polygon",
          data: siteData,
          getPolygon: (d) => d.polygon,
          getElevation: () => 1.5,
          getFillColor: (d) => d.color,
          getLineColor: (d) => d.lineColor ?? [4, 78, 117, 255],
          extruded: true,
          stroked: true,
          wireframe: true,
          lineWidthMinPixels: 2
        })
      );
    }
    if (showVariantMassing) {
      stack.push(
        new PolygonLayer<MapPolygonFeature>({
          id: "variant-polygon",
          data: variantData,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => d.height,
          getFillColor: (d) => d.color,
          getLineColor: (d) => d.lineColor ?? [15, 52, 91, 255],
          extruded: true,
          stroked: true,
          wireframe: true,
          lineWidthMinPixels: 1.5,
          pickable: true,
          transitions: {
            getElevation: 700,
            getFillColor: 700
          }
        })
      );
    }
    return stack;
  }, [
    buildingData,
    showContextBuildings,
    showSiteHalo,
    showSiteBoundary,
    showVariantMassing,
    siteHaloData,
    siteData,
    variantData
  ]);

  return (
    <div className="panel context-panel">
      <div className="panel-header">
        <h3>3. Context + Variant 3D View</h3>
        <div className="viewer-controls">
          <div className="viewer-mode-switch">
            <button
              type="button"
              className={viewerMode === "urban" ? "active" : ""}
              onClick={() => setViewerMode("urban")}
            >
              Urban
            </button>
            <button
              type="button"
              className={viewerMode === "studio" ? "active" : ""}
              onClick={() => setViewerMode("studio")}
            >
              Studio
            </button>
          </div>
          <label className="metric-select">
            Color metric
            <select value={metricMode} onChange={(event) => setMetricMode(event.target.value as typeof metricMode)}>
              <option value="solar_access">Solar</option>
              <option value="daylight_factor">Daylight</option>
              <option value="shadow_impact">Shadow</option>
            </select>
          </label>
        </div>
      </div>
      {viewerMode === "urban" ? (
        <>
          <div className="layer-toggles">
            <label>
              <input
                type="checkbox"
                checked={showContextBuildings}
                onChange={(event) => setShowContextBuildings(event.target.checked)}
              />
              Context
            </label>
            <label>
              <input
                type="checkbox"
                checked={showSiteBoundary}
                onChange={(event) => setShowSiteBoundary(event.target.checked)}
              />
              Site
            </label>
            <label>
              <input type="checkbox" checked={showSiteHalo} onChange={(event) => setShowSiteHalo(event.target.checked)} />
              Buffer
            </label>
            <label>
              <input
                type="checkbox"
                checked={showVariantMassing}
                onChange={(event) => setShowVariantMassing(event.target.checked)}
              />
              Variant
            </label>
          </div>
          <div className="context-canvas">
            <DeckGL
              layers={layers}
              viewState={viewState}
              controller
              onViewStateChange={({ viewState: next }) => setViewState(next as typeof viewState)}
            >
              <Map
                mapLib={maplibregl}
                mapStyle={import.meta.env.VITE_MAP_STYLE_URL ?? "https://demotiles.maplibre.org/style.json"}
              />
            </DeckGL>
          </div>
        </>
      ) : (
        <HqVariantPreview variant={selectedVariant} metric={metricMode} />
      )}
    </div>
  );
}
