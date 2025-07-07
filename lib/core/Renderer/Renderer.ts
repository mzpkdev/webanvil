import Configuration from "@/core/Configuration"
import Page from "@/core/Page"


export default abstract class Renderer {
    protected readonly _configuration: Configuration

    constructor(configuration: Configuration) {
        this._configuration = configuration
    }

    public abstract render(page: Page): string
}
