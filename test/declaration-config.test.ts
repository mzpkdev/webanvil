import type { Options as DtsOptions } from "rolldown-plugin-dts"
import { describe, expectTypeOf, it } from "vitest"

import type { DeclarationConfig } from "../src/core/declaration"

type NativeDeclarationConfig = Omit<DtsOptions, "cwd" | "emitDtsOnly" | "entry" | "parallel">

describe("DeclarationConfig", () => {
    it("accepts every native option except fields owned by WebAnvil", () => {
        expectTypeOf<NativeDeclarationConfig>().toExtend<DeclarationConfig>()
        expectTypeOf<keyof DeclarationConfig>().toEqualTypeOf<keyof NativeDeclarationConfig>()
        expectTypeOf<DeclarationConfig["oxc"]>().toEqualTypeOf<NativeDeclarationConfig["oxc"]>()
    })
})
