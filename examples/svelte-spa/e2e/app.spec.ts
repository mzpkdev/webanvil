import { expect, test } from "webanvil/e2e"

test("renders the Svelte application", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "WebAnvil Svelte SPA" })).toBeVisible()
})
