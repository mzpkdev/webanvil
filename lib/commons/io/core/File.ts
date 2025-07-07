import Path from "./Path"


export default class File {
    private readonly _path: Path
    private readonly _content: string

    constructor(path: Path, content: string) {
        this._path = path
        this._content = content
    }

    public get path(): Path {
        return this._path
    }

    public get content(): string {
        return this._content
    }

    public toString() {
        return this.content
    }

    public valueOf(): string {
        return this.toString()
    }
}
