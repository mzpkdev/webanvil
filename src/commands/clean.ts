import { defineCommand } from "cmdore"

import { clearBuildInfo, readBuildInfo, removeBuildOutputs } from "../core/build-info"
import { logger } from "../tools"

export const clean = async (): Promise<void> => {
    const info = await readBuildInfo()
    await removeBuildOutputs(info.output)
    await clearBuildInfo()
    logger.success(`Removed ${info.output.length} build output${info.output.length === 1 ? "" : "s"}`)
}

export default defineCommand({ name: "clean", run: clean })
