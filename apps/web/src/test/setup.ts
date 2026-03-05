import { expect, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ projects: [] }), { status: 200 }))
);
