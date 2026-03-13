import type { VariantResponse } from "@dimensions/contracts";

interface DashboardSummaryProps {
  backendOnline: boolean;
  projectCount: number;
  variantCount: number;
  selectedVariant: VariantResponse | null;
}

function scoreBadge(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function DashboardSummary({
  backendOnline,
  projectCount,
  variantCount,
  selectedVariant
}: DashboardSummaryProps) {
  return (
    <section className="kpi-grid section-fade-in">
      <article className={`kpi-card ${backendOnline ? "ok" : "bad"}`}>
        <header>System</header>
        <strong>{backendOnline ? "Connected" : "Offline"}</strong>
        <small>{backendOnline ? "API healthy and streaming enabled" : "Start backend to continue"}</small>
      </article>
      <article className="kpi-card">
        <header>Projects</header>
        <strong>{projectCount}</strong>
        <small>Persisted feasibility studies</small>
      </article>
      <article className="kpi-card">
        <header>Variants</header>
        <strong>{variantCount}</strong>
        <small>Generated in active session</small>
      </article>
      <article className="kpi-card accent">
        <header>Selected Option</header>
        {selectedVariant ? (
          <>
            <strong>{selectedVariant.typology.replaceAll("_", " ")}</strong>
            <small>
              Solar {scoreBadge(selectedVariant.scores.solar_access)} | Daylight{" "}
              {scoreBadge(selectedVariant.scores.daylight_factor)} | GFA {Math.round(selectedVariant.scores.gfa_sqm)} sqm
            </small>
          </>
        ) : (
          <>
            <strong>No Selection</strong>
            <small>Generate and choose a preferred option</small>
          </>
        )}
      </article>
    </section>
  );
}
