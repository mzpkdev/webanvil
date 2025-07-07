import { path, Path } from "@/commons/io/sync"
import Plugin from "@/core/Plugin"
import outlinecss from "@/plugins/outlinecss"


export enum TemplateEngine {
    EJS = "ejs"
}

export enum FileExtension {
    HTML = "html"
}

export type RendererConfiguration = {
    engine: TemplateEngine,
    extension: FileExtension
}

export type DirectoriesConfiguration = {
    root: Path
    output: Path
    public: Path
    pages: Path
    styles: Path
    partials: Path
    layouts: Path
}

type Configuration = {
    renderer: RendererConfiguration
    directories: DirectoriesConfiguration
    plugins: Plugin[]
}

export type PlainConfiguration = {
    renderer: Record<keyof RendererConfiguration, string>
    directories: Record<keyof DirectoriesConfiguration, string>
}

const defaults: PlainConfiguration = {
    renderer: {
        engine: "ejs",
        extension: ".html"
    },
    directories: {
        root: ".",
        output: "./build",
        public: "./source/public",
        pages: "./source/pages",
        styles: "./source/styles",
        partials: "./source/templates/partials",
        layouts: "./source/templates/layouts"
    }
}

namespace Configuration {
    export const from = (configuration: Partial<PlainConfiguration>): Configuration => {
        const renderer = {
            ...defaults.renderer,
            ...configuration.renderer
        }
        const directories = {
            ...defaults.directories,
            ...configuration.directories
        }
        return {
            ...defaults,
            ...configuration,
            renderer: {
                engine: renderer.engine as TemplateEngine,
                extension: renderer.extension as FileExtension,
            },
            directories: Object.fromEntries(Object.entries(directories)
                .map(([ property, value ]) =>
                    [ property, path.join(path.cwd(), value) ])) as Configuration["directories"],
            plugins: [
                outlinecss
            ]
        }
    }
}


export default Configuration
