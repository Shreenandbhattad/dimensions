import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { VariantResponse, ZoningConstraints } from "@dimensions/contracts";
import {
  createSite,
  exportVariant,
  generateVariants,
  geocodeAddress,
  getJob,
  getSiteContext,
  getVariant,
  listProjects
} from "./api/client";
import { Context3DView } from "./components/Context3DView";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SiteDrawMap, type SiteMapView } from "./components/SiteDrawMap";
import { VariantGallery } from "./components/VariantGallery";
import { useAppStore } from "./store/useAppStore";
import "./styles.css";

const DEFAULT_ZONING: ZoningConstraints = {
  max_height_m: 120,
  far: 3.0,
  setbacks: { front: 6, side: 4.5, rear: 4.5 },
  coverage_ratio: 0.45
};

export default function App() {
  const [siteName, setSiteName] = useState("Mumbai Pilot Site");
  const [address, setAddress] = useState("Bandra Kurla Complex, Mumbai");
  const [cityCode, setCityCode] = useState("MUMBAI");
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [viewState, setViewState] = useState<SiteMapView>({
    longitude: 72.8777,
    latitude: 19.076,
    zoom: 13.8,
    pitch: 0,
    bearing: 0
  });
  const [statusText, setStatusText] = useState("Draw a site polygon to begin.");
  const [zoning, setZoning] = useState<ZoningConstraints>(DEFAULT_ZONING);
  const [isSubmittingSite, setIsSubmittingSite] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    siteId,
    contextJobId,
    generationJobId,
    context,
    variants,
    selectedVariantId,
    setSite,
    setContext,
    setGenerationJob,
    setVariants,
    setSelectedVariant
  } = useAppStore();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    refetchInterval: import.meta.env.MODE === "test" ? false : 5000
  });

  useEffect(() => {
    if (!contextJobId) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await getJob(contextJobId);
        if (job.status === "running" || job.status === "queued") {
          setStatusText(`Context ingest: ${job.progress}%`);
          return;
        }
        window.clearInterval(timer);
        if (job.status === "failed") {
          setStatusText(`Context ingest failed: ${job.error ?? "Unknown error"}`);
          return;
        }
        if (siteId) {
          const contextResponse = await getSiteContext(siteId);
          setContext(contextResponse);
          setZoning(contextResponse.suggested_constraints);
          setStatusText(`Context ready. ${contextResponse.buildings.length} neighboring buildings loaded.`);
        }
      } catch (error) {
        setStatusText(`Context polling error: ${(error as Error).message}`);
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [contextJobId, setContext, siteId]);

  useEffect(() => {
    if (!generationJobId) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await getJob(generationJobId);
        if (job.status === "running" || job.status === "queued") {
          setStatusText(`Generation: ${job.progress}%`);
          return;
        }
        window.clearInterval(timer);
        setIsGenerating(false);
        if (job.status === "failed") {
          setStatusText(`Generation failed: ${job.error ?? "Unknown error"}`);
          return;
        }
        const variantIds = (job.result.variant_ids as string[]) ?? [];
        const fetched = await Promise.all(variantIds.map((id) => getVariant(id)));
        setVariants(fetched);
        setSelectedVariant(fetched[0]?.id ?? null);
        setStatusText(`${fetched.length} compliant variants generated.`);
      } catch (error) {
        setStatusText(`Generation polling error: ${(error as Error).message}`);
        setIsGenerating(false);
        window.clearInterval(timer);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [generationJobId, setVariants, setSelectedVariant]);

  const selectedVariant = useMemo<VariantResponse | null>(() => {
    if (!selectedVariantId) return null;
    return variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [selectedVariantId, variants]);

  const handleLocateAddress = async () => {
    const result = await geocodeAddress(address);
    if (!result) {
      setStatusText("Address not found. Adjust query and retry.");
      return;
    }
    setViewState((current) => ({
      ...current,
      longitude: result.lng,
      latitude: result.lat,
      zoom: 15.5
    }));
    setStatusText("Address located. Draw polygon around the parcel.");
  };

  const handleCreateSite = async () => {
    if (!polygon) {
      setStatusText("Polygon is required before creating a site.");
      return;
    }
    try {
      setIsSubmittingSite(true);
      const response = await createSite({
        name: siteName,
        city_code: cityCode,
        polygon_geojson: polygon
      });
      setSite(response.site_id, response.context_job_id);
      setStatusText("Site created. Context ingestion started.");
      void projectsQuery.refetch();
    } catch (error) {
      setStatusText(`Site creation failed: ${(error as Error).message}`);
    } finally {
      setIsSubmittingSite(false);
    }
  };

  const handleGenerate = async () => {
    if (!siteId) {
      setStatusText("Create a site first.");
      return;
    }
    try {
      setIsGenerating(true);
      const response = await generateVariants(siteId, {
        zoning_constraints: zoning,
        objectives: ["solar_access", "gfa_sqm"],
        num_variants: 6,
        seed: 42
      });
      setGenerationJob(response.job_id);
      setStatusText("Variant generation started.");
    } catch (error) {
      setIsGenerating(false);
      setStatusText(`Generation request failed: ${(error as Error).message}`);
    }
  };

  const handleExport = async (variantId: string, format: "gltf" | "ifc") => {
    try {
      const response = await exportVariant(variantId, format);
      if (response.url) {
        window.open(response.url, "_blank", "noopener");
      }
      setStatusText(`Export ${format.toUpperCase()} complete.`);
    } catch (error) {
      setStatusText(`Export failed: ${(error as Error).message}`);
    }
  };

  return (
    <main className="app">
      <header className="hero">
        <div>
          <h1>Dimensions</h1>
          <p>Drop a site. Get compliant, scored massing options. Export to Revit-ready IFC.</p>
        </div>
        <div className="status-pill">{statusText}</div>
      </header>

      <section className="grid two-col">
        <div className="panel controls-panel">
          <h3>Site Setup</h3>
          <label>
            Project name
            <input value={siteName} onChange={(event) => setSiteName(event.target.value)} />
          </label>
          <label>
            Address
            <div className="row">
              <input value={address} onChange={(event) => setAddress(event.target.value)} />
              <button type="button" onClick={handleLocateAddress}>
                Locate
              </button>
            </div>
          </label>
          <label>
            City
            <select value={cityCode} onChange={(event) => setCityCode(event.target.value)}>
              <option value="MUMBAI">Mumbai</option>
            </select>
          </label>
          <button type="button" onClick={handleCreateSite} disabled={isSubmittingSite || !polygon}>
            {isSubmittingSite ? "Creating..." : "Create Site"}
          </button>

          <hr />

          <h3>Constraints</h3>
          <label>
            Max height (m)
            <input
              type="number"
              value={zoning.max_height_m}
              onChange={(event) =>
                setZoning((prev) => ({ ...prev, max_height_m: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label>
            FAR
            <input
              type="number"
              step="0.1"
              value={zoning.far}
              onChange={(event) => setZoning((prev) => ({ ...prev, far: Number(event.target.value) || 0 }))}
            />
          </label>
          <label>
            Coverage ratio
            <input
              type="number"
              step="0.01"
              value={zoning.coverage_ratio}
              onChange={(event) =>
                setZoning((prev) => ({ ...prev, coverage_ratio: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <div className="row three">
            <label>
              Front setback
              <input
                type="number"
                value={zoning.setbacks.front}
                onChange={(event) =>
                  setZoning((prev) => ({
                    ...prev,
                    setbacks: { ...prev.setbacks, front: Number(event.target.value) || 0 }
                  }))
                }
              />
            </label>
            <label>
              Side setback
              <input
                type="number"
                value={zoning.setbacks.side}
                onChange={(event) =>
                  setZoning((prev) => ({
                    ...prev,
                    setbacks: { ...prev.setbacks, side: Number(event.target.value) || 0 }
                  }))
                }
              />
            </label>
            <label>
              Rear setback
              <input
                type="number"
                value={zoning.setbacks.rear}
                onChange={(event) =>
                  setZoning((prev) => ({
                    ...prev,
                    setbacks: { ...prev.setbacks, rear: Number(event.target.value) || 0 }
                  }))
                }
              />
            </label>
          </div>
          <button type="button" onClick={handleGenerate} disabled={!siteId || isGenerating}>
            {isGenerating ? "Generating..." : "Generate 6 Variants"}
          </button>
        </div>
        <ProjectsPanel projects={projectsQuery.data?.projects ?? []} />
      </section>

      <section className="grid two-col">
        <SiteDrawMap initialView={viewState} onViewChange={setViewState} onPolygonReady={setPolygon} />
        <Context3DView context={context} sitePolygon={polygon} selectedVariant={selectedVariant} />
      </section>

      <VariantGallery
        variants={variants}
        selectedVariantId={selectedVariantId}
        onSelect={setSelectedVariant}
        onExport={handleExport}
      />
    </main>
  );
}
