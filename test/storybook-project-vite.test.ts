import type { InlineConfig } from "vite"

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/config", () => ({ loadConfig: vi.fn() }))
vi.mock("../src/plugins", () => ({ resolveVitePlugins: vi.fn() }))

import { loadConfig } from "../src/config"
import { resolveVitePlugins } from "../src/plugins"
import { withProjectVitePlugins } from "../src/storybook/project-vite"

describe("withProjectVitePlugins", () => {
    beforeEach(() => {
        vi.mocked(loadConfig).mockReset()
        vi.mocked(resolveVitePlugins).mockReset()
    })

    it("prepends both WebAnvil and Vite config plugins", async () => {
        const webanvilPlugin = { name: "webanvil" }
        const vitePlugin = { name: "vite" }
        const storybookPlugin = { name: "storybook" }
        const config: InlineConfig = { plugins: [storybookPlugin] }

        vi.mocked(loadConfig).mockResolvedValue({
            config: { plugins: [webanvilPlugin], vite: { plugins: [vitePlugin] } }
        })
        vi.mocked(resolveVitePlugins).mockReturnValue([webanvilPlugin])

        await expect(withProjectVitePlugins(config)).resolves.toEqual({
            plugins: [webanvilPlugin, vitePlugin, storybookPlugin]
        })
        expect(resolveVitePlugins).toHaveBeenCalledWith([webanvilPlugin])
    })
})
