import Plugin, { Signal } from "@/core/Plugin"
import EventEmitter, { Event } from "@/core/EventEmitter"
import { path } from "@/commons/io/sync"
import Configuration from "@/core/Configuration"


const requireFromParent = (moduleName: string) => {
    try {
        const modulePath = require.resolve(moduleName, { paths: [process.cwd()] });
        return require(modulePath);
    } catch (err) {
        console.error(`Module "${moduleName}" not found in parent package.`);
        throw err;
    }
}

const plugin: Plugin = {
    name: "outlinecss",
    install(emitter: EventEmitter, configuration: Configuration) {
        const { signal, resolve } = Signal()
        emitter.on(Event.END, async () => {
            const { directories } = configuration
            const outline = requireFromParent("outlinecss")
            if (outline) {
                const entry = path.join(directories.styles, "./main.scss").full
                const output = path.join(
                    directories.output,
                    "assets",
                    `${directories.styles.base}.css`
                ).full
                const tokens = path.join(directories.styles, "./tokens").full
                await outline.build({ entry, output, tokens })
                resolve()
            }
        })
        return signal
    }
}


export default plugin