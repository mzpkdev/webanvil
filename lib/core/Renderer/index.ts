export { default as Renderer } from "./Renderer"

import Configuration from "@/core/Configuration"
import EJSRenderer from "@/renderers/EJSRenderer"
import Renderer from "./Renderer"


namespace RendererFactory {
    export const from = (configuration: Configuration): Renderer => {
        const { engine } = configuration.renderer
        switch (engine) {
            case EJSRenderer.engine:
            default:
                return new EJSRenderer(configuration)
        }
    }
}


export default RendererFactory
