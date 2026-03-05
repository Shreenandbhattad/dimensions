import { useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PolygonLayer } from "@deck.gl/layers";
import Map from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { SiteContextResponse, VariantResponse } from "@dimensions/contracts";

interface Context3DViewProps {
  context: SiteContextResponse | null;
  sitePolygon: GeoJSON.Polygon | null;
  selectedVariant: VariantResponse | null;
}

type MapPolygonFeature = {
  polygon: number[][];
  height: number;
  color: [number, number, number, number];
};

export function Context3DView({ context, sitePolygon, selectedVariant }: Context3DViewProps) {
  const [viewState, setViewState] = useState({
    longitude: 72.8777,
    latitude: 19.076,
    zoom: 14.8,
    pitch: 52,
    bearing: -12
  });

  const buildingData = useMemo<MapPolygonFeature[]>(() => {
    if (!context) return [];
    return context.buildings.map((building) => ({
      polygon: building.footprint_geojson.coordinates[0].map(([lng, lat]) => [lng, lat]),
      height: building.height_m,
      color: [132, 141, 154, 180]
    }));
  }, [context]);

  const siteData = useMemo<MapPolygonFeature[]>(() => {
    if (!sitePolygon) return [];
    return [
      {
        polygon: sitePolygon.coordinates[0].map(([lng, lat]) => [lng, lat]),
        height: 2,
        color: [14, 116, 144, 180]
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
        color: [10, 132, 255, 190]
      }));
  }, [selectedVariant]);

  const layers = useMemo(
    () => [
      new PolygonLayer<MapPolygonFeature>({
        id: "context-buildings",
        data: buildingData,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.height,
        getFillColor: (d) => d.color,
        extruded: true,
        wireframe: true,
        pickable: false
      }),
      new PolygonLayer<MapPolygonFeature>({
        id: "site-polygon",
        data: siteData,
        getPolygon: (d) => d.polygon,
        getElevation: () => 2,
        getFillColor: (d) => d.color,
        extruded: true,
        stroked: true,
        getLineColor: [14, 116, 144, 255],
        lineWidthMinPixels: 2
      }),
      new PolygonLayer<MapPolygonFeature>({
        id: "variant-polygon",
        data: variantData,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.height,
        getFillColor: (d) => d.color,
        extruded: true,
        wireframe: true,
        pickable: true
      })
    ],
    [buildingData, siteData, variantData]
  );

  return (
    <div className="panel context-panel">
      <div className="panel-header">
        <h3>3. Context + Variant 3D View</h3>
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
    </div>
  );
}
