import * as bs from "browser-sync"
import { path } from "@/commons/io/sync/index"
import Configuration from "@/core/Configuration"
import build from "./build"


export default async function serve(configuration: Configuration): Promise<number> {
    await build(configuration)
    const browser = bs.create()

    const rebuild = async () => {
        return build(configuration)
    }

    const reload = async () => {
        browser.reload()
    }

    browser.watch(path.join(configuration.directories.public, `**/*`).full)
        .on("change", run(reload))
    browser.watch(path.join(configuration.directories.pages, `**/*`).full)
        .on("change", run(rebuild, reload))
    browser.watch(path.join(configuration.directories.partials, `**/*`).full)
        .on("change", run(rebuild, reload))
    browser.watch(path.join(configuration.directories.layouts, `**/*`).full)
        .on("change", run(rebuild, reload))
    browser.watch(path.join(configuration.directories.styles, `**/*`).full)
        .on("change", run(rebuild, reload))
    browser.init({
        server: configuration.directories.output.full,
        open: false
    })
    return new Promise(() => void 0)
}

const run = (...jobs: (() => Promise<unknown>)[]): () => void => {
    return (...varargs: unknown[]) => {
        return jobs.reduce((accumulator, job) => {
            return accumulator.then(job)
        }, Promise.resolve(varargs[0]))
    }
}
