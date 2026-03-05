import { useMemo, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type ViewState
} from "react-map-gl/maplibre";
import maplibregl, { type FillLayerSpecification, type LineLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface SiteDrawMapProps {
  initialView: SiteMapView;
  onViewChange: (next: SiteMapView) => void;
  onPolygonReady: (polygon: GeoJSON.Polygon | null) => void;
}

export interface SiteMapView {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const fillLayer: Omit<FillLayerSpecification, "source"> = {
  id: "drawn-polygon-fill",
  type: "fill",
  paint: {
    "fill-color": "#0ea5e9",
    "fill-opacity": 0.25
  }
};

const lineLayer: Omit<LineLayerSpecification, "source"> = {
  id: "drawn-polygon-line",
  type: "line",
  paint: {
    "line-color": "#0284c7",
    "line-width": 2
  }
};

export function SiteDrawMap({ initialView, onViewChange, onPolygonReady }: SiteDrawMapProps) {
  const [vertices, setVertices] = useState<Array<[number, number]>>([]);

  const polygon = useMemo(() => {
    if (vertices.length < 3) return null;
    return {
      type: "Polygon",
      coordinates: [[...vertices, vertices[0]]]
    } satisfies GeoJSON.Polygon;
  }, [vertices]);

  const onMapClick = (event: MapLayerMouseEvent) => {
    const lng = Number(event.lngLat.lng.toFixed(6));
    const lat = Number(event.lngLat.lat.toFixed(6));
    setVertices((current) => [...current, [lng, lat]]);
  };

  const completePolygon = () => {
    if (polygon) {
      onPolygonReady(polygon);
    }
  };

  const undoVertex = () => {
    setVertices((current) => current.slice(0, -1));
    onPolygonReady(null);
  };

  const reset = () => {
    setVertices([]);
    onPolygonReady(null);
  };

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <h3>1. Draw Site Polygon</h3>
        <div className="map-actions">
          <button type="button" onClick={undoVertex} disabled={!vertices.length}>
            Undo
          </button>
          <button type="button" onClick={reset} disabled={!vertices.length}>
            Reset
          </button>
          <button type="button" onClick={completePolygon} disabled={vertices.length < 3}>
            Complete Polygon
          </button>
        </div>
      </div>
      <p className="panel-hint">Click on map to place vertices. Complete polygon when finished.</p>
      <Map
        mapLib={maplibregl}
        mapStyle={import.meta.env.VITE_MAP_STYLE_URL ?? "https://demotiles.maplibre.org/style.json"}
        {...initialView}
        onMove={(event) => {
          const next = event.viewState as ViewState;
          onViewChange({
            longitude: next.longitude,
            latitude: next.latitude,
            zoom: next.zoom,
            pitch: next.pitch,
            bearing: next.bearing
          });
        }}
        onClick={onMapClick}
        doubleClickZoom={false}
      >
        <NavigationControl position="top-right" />
        {vertices.map((vertex, index) => (
          <Marker key={`${vertex[0]}-${vertex[1]}-${index}`} longitude={vertex[0]} latitude={vertex[1]}>
            <span className="vertex-marker" />
          </Marker>
        ))}
        {polygon ? (
          <Source id="polygon-source" type="geojson" data={polygon}>
            <Layer {...fillLayer} />
            <Layer {...lineLayer} />
          </Source>
        ) : null}
      </Map>
    </div>
  );
}
