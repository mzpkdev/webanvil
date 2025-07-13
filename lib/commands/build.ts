import { fs, path } from "@/commons/io/sync"
import Configuration from "@/core/Configuration"
import Renderer from "@/core/Renderer"
import Page from "@/core/Page"
import EventEmitter, { Event } from "@/core/EventEmitter"


export default async function build(configuration: Configuration): Promise<number> {
    const pages = fs.deepdir(configuration.directories.pages)
        .filter(pathname => pathname.base.includes(configuration.renderer.extension))
        .map(pathname => Page.from(pathname))
    const renderer = Renderer.from(configuration)
    const emitter = new EventEmitter()
    const signals = []
    for (const plugin of configuration.plugins) {
        signals.push(plugin.install(emitter, configuration))
    }
    fs.rm(configuration.directories.output)
    for (const page of pages) {
        const html = renderer.render(page)
        const output = page.path
            .replace(configuration.directories.pages, "")
        if (output.base === "index.html") {
            fs.write(path.join(configuration.directories.output, output), html)
        } else {
            fs.write(path.join(configuration.directories.output, output.dir, output.name, "index.html"), html)
        }
        fs.cp(
            configuration.directories.public,
            configuration.directories.output
        )
    }
    emitter.emit(Event.END)
    await Promise.all(signals)
    return 0
}