import { test, expect } from "@playwright/test";

test("loads the dimensions shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dimensions" })).toBeVisible();
  await expect(page.getByText("Draw a site polygon to begin.")).toBeVisible();
});

