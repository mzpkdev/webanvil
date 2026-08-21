import { context, describe, expect, it } from "webanvil/e2e"

describe("Svelte application", () => {
    context("when a visitor opens it", () => {
        it("renders its heading", async ({ page }) => {
            await page.goto("/")

            await expect(page.getByRole("heading", { name: "WebAnvil Svelte SPA" })).toBeVisible()
        })
    })
})
