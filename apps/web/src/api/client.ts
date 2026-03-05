import type {
  ExportResponse,
  GenerateRequest,
  GenerateResponse,
  JobResponse,
  ProjectListResponse,
  SiteContextResponse,
  SiteCreateRequest,
  SiteCreateResponse,
  VariantResponse
} from "@dimensions/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function createSite(payload: SiteCreateRequest): Promise<SiteCreateResponse> {
  return request<SiteCreateResponse>("/sites", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getSiteContext(siteId: string): Promise<SiteContextResponse> {
  return request<SiteContextResponse>(`/sites/${siteId}/context`);
}

export async function getJob(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/jobs/${jobId}`);
}

export async function generateVariants(
  siteId: string,
  payload: GenerateRequest
): Promise<GenerateResponse> {
  return request<GenerateResponse>(`/sites/${siteId}/generate`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getVariant(variantId: string): Promise<VariantResponse> {
  return request<VariantResponse>(`/variants/${variantId}`);
}

export async function exportVariant(
  variantId: string,
  format: "gltf" | "ifc"
): Promise<ExportResponse> {
  return request<ExportResponse>(`/variants/${variantId}/export`, {
    method: "POST",
    body: JSON.stringify({ format })
  });
}

export async function listProjects(): Promise<ProjectListResponse> {
  return request<ProjectListResponse>("/projects");
}

export async function geocodeAddress(address: string): Promise<{ lng: number; lat: number } | null> {
  if (!address.trim()) return null;
  const query = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1"
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
    headers: {
      "Accept-Language": "en"
    }
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as Array<{ lon: string; lat: string }>;
  if (!payload.length) return null;
  return { lng: Number(payload[0].lon), lat: Number(payload[0].lat) };
}

