import type { InlineConfig } from "vite"

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@storybook/svelte-vite/preset", () => ({ viteFinal: vi.fn() }))
vi.mock("../src/storybook/project-vite", () => ({ withProjectVitePlugins: vi.fn() }))

import { viteFinal as storybookViteFinal } from "@storybook/svelte-vite/preset"

import { withProjectVitePlugins } from "../src/storybook/project-vite"
import { viteFinal } from "../src/storybook/svelte/preset"

describe("Svelte Storybook preset", () => {
    beforeEach(() => {
        vi.mocked(storybookViteFinal).mockReset()
        vi.mocked(withProjectVitePlugins).mockReset()
    })

    it("adds project plugins after Storybook configures its Vite plugins", async () => {
        const initialConfig: InlineConfig = { plugins: [{ name: "existing" }] }
        const storybookConfig: InlineConfig = {
            plugins: [{ name: "existing" }, { name: "storybook-docgen" }]
        }
        const finalConfig: InlineConfig = {
            plugins: [{ name: "svelte" }, { name: "existing" }, { name: "storybook-docgen" }]
        }
        vi.mocked(storybookViteFinal).mockResolvedValue(storybookConfig)
        vi.mocked(withProjectVitePlugins).mockResolvedValue(finalConfig)

        await expect(viteFinal(initialConfig, {} as never)).resolves.toBe(finalConfig)

        expect(storybookViteFinal).toHaveBeenCalledWith(initialConfig, {})
        expect(withProjectVitePlugins).toHaveBeenCalledWith(storybookConfig)
    })
})
