import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";

vi.mock("./components/SiteDrawMap", () => ({
  SiteDrawMap: () => <div>SiteDrawMapMock</div>
}));

vi.mock("./components/Context3DView", () => ({
  Context3DView: () => <div>Context3DViewMock</div>
}));

vi.mock("./components/VariantGallery", () => ({
  VariantGallery: () => <div>VariantGalleryMock</div>
}));

vi.mock("./components/SolarStudyBoard", () => ({
  SolarStudyBoard: () => <div>SolarStudyBoardMock</div>
}));

vi.mock("./components/MassingWorkbench", () => ({
  MassingWorkbench: () => <div>MassingWorkbenchMock</div>
}));

describe("App", () => {
  it("renders core header", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    );
    expect(screen.getByRole("heading", { name: "Dimensions" })).toBeInTheDocument();
  });
});
