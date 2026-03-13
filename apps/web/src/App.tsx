import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { VariantResponse, ZoningConstraints } from "@dimensions/contracts";
import {
  createSite,
  exportVariant,
  generateVariants,
  geocodeAddress,
  getHealth,
  getSiteContext,
  getVariant,
  listProjects,
  streamJob
} from "./api/client";
import { Context3DView } from "./components/Context3DView";
import { DashboardSummary } from "./components/DashboardSummary";
import { MassingWorkbench } from "./components/MassingWorkbench";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SiteDrawMap, type SiteMapView } from "./components/SiteDrawMap";
import { SolarStudyBoard } from "./components/SolarStudyBoard";
import { VariantGallery } from "./components/VariantGallery";
import { WorkflowStepper } from "./components/WorkflowStepper";
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
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [recentVariantIds, setRecentVariantIds] = useState<string[]>([]);
  const [zoning, setZoning] = useState<ZoningConstraints>(DEFAULT_ZONING);
  const [isSubmittingSite, setIsSubmittingSite] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const seenVariantIdsRef = useRef<Set<string>>(new Set());

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
    upsertVariants,
    clearVariants,
    setSelectedVariant
  } = useAppStore();

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    refetchInterval: import.meta.env.MODE === "test" ? false : 5000
  });
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: import.meta.env.MODE === "test" ? false : 3000,
    retry: false
  });
  const backendOnline = healthQuery.data?.status === "ok";
  const siteReady = Boolean(siteId);
  const contextReady = Boolean(context?.context_ready);
  const generationStarted = isGenerating || Boolean(generationJobId);
  const variantsReady = variants.length > 0;

  useEffect(() => {
    if (!contextJobId) return;
    const source = streamJob(contextJobId, {
      onUpdate: (job) => {
        setJobProgress(job.progress);
        if (job.status === "running" || job.status === "queued") {
          setStatusText(`Context ingest: ${job.progress}%`);
        }
      },
      onDone: async (job) => {
        setJobProgress(null);
        if (job.status === "failed") {
          setStatusText(`Context ingest failed: ${job.error ?? "Unknown error"}`);
          return;
        }
        if (siteId) {
          try {
            const contextResponse = await getSiteContext(siteId);
            setContext(contextResponse);
            setZoning(contextResponse.suggested_constraints);
            setStatusText(`Context ready. ${contextResponse.buildings.length} neighboring buildings loaded.`);
          } catch (error) {
            setStatusText(`Context load failed: ${(error as Error).message}`);
          }
        }
      },
      onError: (message) => {
        setJobProgress(null);
        setStatusText(message);
      }
    });
    return () => source.close();
  }, [contextJobId, setContext, siteId]);

  useEffect(() => {
    if (!generationJobId) return;
    const source = streamJob(generationJobId, {
      onUpdate: async (job) => {
        setJobProgress(job.progress);
        const allVariantIds = (job.result.variant_ids as string[] | undefined) ?? [];
        const incoming = allVariantIds.filter((id) => !seenVariantIdsRef.current.has(id));
        if (incoming.length > 0) {
          incoming.forEach((id) => seenVariantIdsRef.current.add(id));
          const fetched = await Promise.all(incoming.map((id) => getVariant(id)));
          startTransition(() => {
            upsertVariants(fetched);
            setRecentVariantIds((current) => [...current, ...incoming]);
            if (!selectedVariantId) {
              setSelectedVariant(fetched[0]?.id ?? null);
            }
          });
          window.setTimeout(() => {
            startTransition(() => {
              setRecentVariantIds((current) => current.filter((id) => !incoming.includes(id)));
            });
          }, 1000);
          setStatusText(
            `Generation: ${job.result.generated_count ?? incoming.length}/${job.result.target_count ?? 6} variants ready.`
          );
        } else if (job.status === "running" || job.status === "queued") {
          setStatusText(`Generation: ${job.progress}%`);
        }
      },
      onDone: async (job) => {
        setIsGenerating(false);
        setJobProgress(null);
        if (job.status === "failed") {
          setStatusText(`Generation failed: ${job.error ?? "Unknown error"}`);
          return;
        }
        const variantIds = (job.result.variant_ids as string[] | undefined) ?? [];
        const unresolved = variantIds.filter((id) => !seenVariantIdsRef.current.has(id));
        if (unresolved.length > 0) {
          const fetched = await Promise.all(unresolved.map((id) => getVariant(id)));
          upsertVariants(fetched);
        }
        setStatusText(`${variantIds.length} compliant variants generated.`);
      },
      onError: (message) => {
        setIsGenerating(false);
        setJobProgress(null);
        setStatusText(message);
      }
    });
    return () => source.close();
  }, [generationJobId, selectedVariantId, setSelectedVariant, upsertVariants]);

  const selectedVariant = useMemo<VariantResponse | null>(() => {
    if (!selectedVariantId) return null;
    return variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [selectedVariantId, variants]);
  const deferredSelectedVariant = useDeferredValue(selectedVariant);

  const handleLocateAddress = async () => {
    if (!backendOnline) {
      setStatusText("Backend offline. Start API before geocoding and site actions.");
      return;
    }
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
    if (!backendOnline) {
      setStatusText("Backend offline. Run API with python -m uvicorn app.main:app --reload --port 8000");
      return;
    }
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
      clearVariants();
      setSelectedVariant(null);
      seenVariantIdsRef.current = new Set();
      setJobProgress(0);
      setStatusText("Site created. Context ingestion started.");
      void projectsQuery.refetch();
    } catch (error) {
      setStatusText(`Site creation failed: ${(error as Error).message}`);
    } finally {
      setIsSubmittingSite(false);
    }
  };

  const handleGenerate = async () => {
    if (!backendOnline) {
      setStatusText("Backend offline. Start API first.");
      return;
    }
    if (!siteId) {
      setStatusText("Create a site first.");
      return;
    }
    try {
      setIsGenerating(true);
      clearVariants();
      setSelectedVariant(null);
      seenVariantIdsRef.current = new Set();
      const response = await generateVariants(siteId, {
        zoning_constraints: zoning,
        objectives: ["solar_access", "gfa_sqm"],
        num_variants: 6,
        seed: 42
      });
      setJobProgress(0);
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
          <p>Drop a site. Read the sun. Model the massing. Export a compliant option to Revit-ready IFC.</p>
        </div>
        <div className={`status-pill ${backendOnline ? "online" : "offline"}`}>
          {backendOnline ? "Backend: connected" : "Backend: offline"} | {statusText}
        </div>
      </header>
      {jobProgress !== null ? (
        <div className="progress-shell">
          <div className="progress-bar" style={{ width: `${Math.max(2, jobProgress)}%` }} />
        </div>
      ) : null}
      <DashboardSummary
        backendOnline={backendOnline}
        projectCount={projectsQuery.data?.projects.length ?? 0}
        variantCount={variants.length}
        selectedVariant={selectedVariant}
      />
      <WorkflowStepper
        siteReady={siteReady}
        contextReady={contextReady}
        generationStarted={generationStarted}
        variantsReady={variantsReady}
      />

      <section className="grid two-col section-fade-in">
        <div className="panel controls-panel panel-float">
          <h3>Site Setup</h3>
          <label>
            Project name
            <input value={siteName} onChange={(event) => setSiteName(event.target.value)} />
          </label>
          <label>
            Address
            <div className="row">
              <input value={address} onChange={(event) => setAddress(event.target.value)} />
              <button type="button" onClick={handleLocateAddress} disabled={!backendOnline}>
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
          <button type="button" onClick={handleCreateSite} disabled={isSubmittingSite || !polygon || !backendOnline}>
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
          <button type="button" onClick={handleGenerate} disabled={!siteId || isGenerating || !backendOnline}>
            {isGenerating ? "Generating..." : "Generate 6 Variants"}
          </button>
        </div>
        <div className="panel-float">
          <ProjectsPanel projects={projectsQuery.data?.projects ?? []} />
        </div>
      </section>

      <section className="grid two-col section-fade-in-delayed">
        <SiteDrawMap initialView={viewState} onViewChange={setViewState} onPolygonReady={setPolygon} />
        <Context3DView context={context} sitePolygon={polygon} selectedVariant={deferredSelectedVariant} />
      </section>

      <section className="grid two-col analysis-grid section-fade-in-delayed">
        <SolarStudyBoard context={context} sitePolygon={polygon} selectedVariant={deferredSelectedVariant} />
        <MassingWorkbench variant={deferredSelectedVariant} />
      </section>

      <VariantGallery
        variants={variants}
        selectedVariantId={selectedVariantId}
        recentVariantIds={recentVariantIds}
        onSelect={setSelectedVariant}
        onExport={handleExport}
      />
    </main>
  );
}
