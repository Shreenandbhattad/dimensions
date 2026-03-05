import type {
  JobStatus,
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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const REQUEST_TIMEOUT_MS = 15000;

function healthUrlFromApiBase(apiBase: string): string {
  if (apiBase.endsWith("/api/v1")) {
    return `${apiBase.slice(0, -"/api/v1".length)}/healthz`;
  }
  return `${apiBase}/healthz`;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      signal: controller.signal,
      ...init
    });
  } catch (error) {
    window.clearTimeout(timer);
    const isAbort = (error as Error).name === "AbortError";
    if (isAbort) {
      throw new Error(`Request timed out (${timeoutMs}ms).`);
    }
    throw new Error(
      `Network error: cannot reach backend at ${API_BASE}. Start API with "python -m uvicorn app.main:app --reload --port 8000".`
    );
  }
  window.clearTimeout(timer);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function getHealth(): Promise<{ status: JobStatus | "ok" | "unreachable" }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(healthUrlFromApiBase(API_BASE), { signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) {
      return { status: "unreachable" };
    }
    const payload = (await response.json()) as { status?: string };
    if (payload.status === "ok") {
      return { status: "ok" };
    }
    return { status: "unreachable" };
  } catch {
    window.clearTimeout(timer);
    return { status: "unreachable" };
  }
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

export function streamJob(
  jobId: string,
  handlers: {
    onUpdate: (job: JobResponse) => void;
    onDone: (job: JobResponse) => void;
    onError: (message: string) => void;
  }
): EventSource {
  const source = new EventSource(`${API_BASE}/jobs/${jobId}/stream`);
  source.addEventListener("update", (event) => {
    const payload = JSON.parse((event as MessageEvent<string>).data) as JobResponse;
    handlers.onUpdate(payload);
  });
  source.addEventListener("done", (event) => {
    const payload = JSON.parse((event as MessageEvent<string>).data) as JobResponse;
    handlers.onDone(payload);
    source.close();
  });
  source.addEventListener("error", () => {
    handlers.onError("Job stream disconnected.");
    source.close();
  });
  source.onerror = () => {
    handlers.onError("Job stream error.");
    source.close();
  };
  return source;
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
