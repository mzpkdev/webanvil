import { buildCommand } from "./build"
import { bundleCommand } from "./bundle"
import { cleanCommand } from "./clean"
import { devCommand, serveCommand } from "./dev"
import { formatCommand } from "./format"
import { initCommand } from "./init"
import { lintCommand } from "./lint"
import { previewCommand } from "./preview"
import { runCommand } from "./run"
import { testCommand } from "./test"
import { typecheckCommand } from "./typecheck"

export * from "./build"
export * from "./bundle"
export * from "./clean"
export * from "./dev"
export * from "./format"
export * from "./init"
export * from "./lint"
export * from "./preview"
export * from "./run"
export * from "./test"
export * from "./typecheck"

/** Every command wired into the webanvil CLI, in help-display order. */
export const commands = [
    initCommand,
    buildCommand,
    bundleCommand,
    devCommand,
    serveCommand,
    previewCommand,
    testCommand,
    typecheckCommand,
    lintCommand,
    formatCommand,
    runCommand,
    cleanCommand
]
