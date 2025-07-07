import Configuration from "@/core/Configuration"
import build from "@/commands/build"
import serve from "@/commands/serve"
import * as minimist from "minimist"


const DEFAULT_OUTPUT = "./website-dist"
const DEFAULT_ENTRY = "./website"

export async function main(...varargs: string[]): Promise<number> {
    const options = minimist(varargs, {
        alias: { o: "output", e: "entry" },
        default: { output: DEFAULT_OUTPUT, entry: DEFAULT_ENTRY }
    })
    const [ command ] = varargs
    const directories = {
        root: ".",
        output: options.output,
        public: `${options.entry}/public`,
        pages: `${options.entry}/pages`,
        styles: `${options.entry}/styles`,
        partials: `${options.entry}/templates/partials`,
        layouts: `${options.entry}/templates/layouts`
    }
    const configuration = Configuration.from({ directories })
    switch (command) {
        default:
        case "build":
            return await build(configuration)
        case "serve":
            return serve(configuration)
    }
}


main(...process.argv.slice(2))
    .then(code => console.log(code))
    .catch(error => console.log(error))