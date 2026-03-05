import { create } from "zustand";
import type { SiteContextResponse, VariantResponse } from "@dimensions/contracts";

interface AppState {
  siteId: string | null;
  contextJobId: string | null;
  generationJobId: string | null;
  selectedVariantId: string | null;
  context: SiteContextResponse | null;
  variants: VariantResponse[];
  setSite(siteId: string, contextJobId: string): void;
  setContext(context: SiteContextResponse | null): void;
  setGenerationJob(jobId: string | null): void;
  setVariants(variants: VariantResponse[]): void;
  upsertVariants(variants: VariantResponse[]): void;
  clearVariants(): void;
  setSelectedVariant(variantId: string | null): void;
}

export const useAppStore = create<AppState>((set) => ({
  siteId: null,
  contextJobId: null,
  generationJobId: null,
  selectedVariantId: null,
  context: null,
  variants: [],
  setSite: (siteId, contextJobId) => set({ siteId, contextJobId }),
  setContext: (context) => set({ context }),
  setGenerationJob: (generationJobId) => set({ generationJobId }),
  setVariants: (variants) => set({ variants }),
  upsertVariants: (incoming) =>
    set((state) => {
      const byId = new Map(state.variants.map((variant) => [variant.id, variant]));
      for (const variant of incoming) {
        byId.set(variant.id, variant);
      }
      return { variants: Array.from(byId.values()) };
    }),
  clearVariants: () => set({ variants: [] }),
  setSelectedVariant: (selectedVariantId) => set({ selectedVariantId })
}));
