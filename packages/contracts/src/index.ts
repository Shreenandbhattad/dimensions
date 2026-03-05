export type JobStatus = "queued" | "running" | "complete" | "failed";

export interface Setbacks {
  front: number;
  side: number;
  rear: number;
}

export interface ZoningConstraints {
  max_height_m: number;
  far: number;
  setbacks: Setbacks;
  coverage_ratio: number;
}

export interface SiteCreateRequest {
  name: string;
  polygon_geojson: GeoJSON.Polygon;
  city_code: string;
}

export interface SiteCreateResponse {
  site_id: string;
  context_job_id: string;
  status: JobStatus;
}

export interface JobResponse {
  id: string;
  status: JobStatus;
  progress: number;
  job_type: string;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContextBuildingFeature {
  osm_id: number;
  height_m: number;
  storeys: number | null;
  building_type: string | null;
  footprint_geojson: GeoJSON.Polygon;
}

export interface SiteContextResponse {
  site_id: string;
  context_ready: boolean;
  context_artifact_url: string | null;
  dem_artifact_url: string | null;
  suggested_constraints: ZoningConstraints;
  buildings: ContextBuildingFeature[];
}

export interface GenerateRequest {
  zoning_constraints: ZoningConstraints;
  objectives?: string[];
  num_variants?: number;
  seed?: number;
}

export interface GenerateResponse {
  job_id: string;
}

export interface VariantScores {
  solar_access: number;
  daylight_factor: number;
  shadow_impact: number;
  far_achieved: number;
  gfa_sqm: number;
  cost_index_usd: number;
}

export interface ComplianceFlags {
  setback_ok: boolean;
  height_ok: boolean;
  far_ok: boolean;
  coverage_ok: boolean;
}

export interface VariantResponse {
  id: string;
  site_id: string;
  generation_run_id: string;
  typology: string;
  massing_params: {
    blocks: Array<{
      name: string;
      footprint_local: number[][];
      footprint_wgs84?: number[][];
      height_m: number;
      floor_count: number;
      floor_height_m: number;
      material_hint: string;
    }>;
    frame_origin: { lat: number; lng: number };
  };
  scores: VariantScores;
  compliance_flags: ComplianceFlags;
  gltf_download_url: string | null;
  ifc_download_url: string | null;
  created_at: string;
}

export interface ExportResponse {
  export_id: string;
  status: JobStatus;
  url: string | null;
  expires_in_seconds: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  city_code: string;
  updated_at: string;
  variant_count: number;
  context_ready: boolean;
}

export interface ProjectListResponse {
  projects: ProjectListItem[];
}
