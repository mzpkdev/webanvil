import Page from "@/core/Page"
import Renderer from "../core/Renderer/Renderer"
import { fs, path } from "@/commons/io/sync/index"


export default class EJSRenderer extends Renderer {
    public static readonly engine = "ejs"

    public render(page: Page): string {
        const { directories, renderer } = this._configuration
        const ejs = require(EJSRenderer.engine)
        const [ , ext ] = page.layout.split(".")
        const layout = fs.read(
            path.join(directories.layouts, page.layout)
                .replace({ ext: ext ?? renderer.extension })
        )
        const include = (pathname: string, data: Record<string, unknown>) => {
            const [ , ext ] = pathname.split(".")
            const file = fs.read(
                path.join(directories.partials, pathname)
                    .replace({ ext: ext ?? renderer.extension })
            )
            return ejs.render(file.content, { ...page.data, ...data, include })
        }
        return ejs.render(layout.content, {
            title: page.data.title ?? "",
            body: ejs.render(page.content, { ...page.data, include }, {
                views: [
                    String(directories.partials)
                ]
            }),
            include
        }, {
            views: [
                String(directories.partials)
            ]
        })
    }
}
