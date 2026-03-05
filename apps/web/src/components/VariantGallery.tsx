import { useMemo, useState } from "react";
import type { VariantResponse } from "@dimensions/contracts";

type SortField = "solar_access" | "daylight_factor" | "shadow_impact" | "gfa_sqm";

interface VariantGalleryProps {
  variants: VariantResponse[];
  selectedVariantId: string | null;
  recentVariantIds: string[];
  onSelect: (variantId: string) => void;
  onExport: (variantId: string, format: "gltf" | "ifc") => void;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

export function VariantGallery({
  variants,
  selectedVariantId,
  recentVariantIds,
  onSelect,
  onExport
}: VariantGalleryProps) {
  const [sortBy, setSortBy] = useState<SortField>("solar_access");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const clone = [...variants];
    clone.sort((a, b) => {
      const aValue = a.scores[sortBy];
      const bValue = b.scores[sortBy];
      const order = sortDirection === "asc" ? 1 : -1;
      return (aValue - bValue) * order;
    });
    return clone;
  }, [variants, sortBy, sortDirection]);

  return (
    <div className="panel variants-panel">
      <div className="panel-header">
        <h3>4. Variant Comparison</h3>
        <div className="sort-controls">
          <label>
            Sort:
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortField)}>
              <option value="solar_access">Solar</option>
              <option value="daylight_factor">Daylight</option>
              <option value="shadow_impact">Shadow</option>
              <option value="gfa_sqm">GFA</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            {sortDirection === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>
      <div className="variant-grid">
        {sorted.map((variant) => {
          const isSelected = variant.id === selectedVariantId;
          const isNew = recentVariantIds.includes(variant.id);
          return (
            <article
              key={variant.id}
              className={`variant-card ${isSelected ? "selected" : ""} ${isNew ? "new-card" : ""}`}
              onClick={() => onSelect(variant.id)}
            >
              <div className="variant-title">
                <span>{variant.typology.replaceAll("_", " ")}</span>
                <small>{variant.id.slice(0, 8)}</small>
              </div>
              <ul>
                <li>Solar: {formatPercent(variant.scores.solar_access)}</li>
                <li>Daylight: {formatPercent(variant.scores.daylight_factor)}</li>
                <li>Shadow: {formatPercent(variant.scores.shadow_impact)}</li>
                <li>FAR: {variant.scores.far_achieved.toFixed(2)}</li>
                <li>GFA: {Math.round(variant.scores.gfa_sqm)} sqm</li>
                <li>Cost index: ${formatCurrency(variant.scores.cost_index_usd)}</li>
              </ul>
              <div className="export-row">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onExport(variant.id, "gltf");
                  }}
                >
                  Export GLTF
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onExport(variant.id, "ifc");
                  }}
                >
                  Export IFC
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
