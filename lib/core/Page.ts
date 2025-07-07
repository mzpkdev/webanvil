import * as matter from "gray-matter"
import { Path, PathLike, fs, path } from "@/commons/io/sync/index"


export default class Page {
    private readonly _path: Path
    private readonly _content: string
    private readonly _layout: string
    private readonly _data: Record<string, unknown>

    public static from(pathname: PathLike): Page {
        const file = fs.read(pathname)
        const { content, data: { layout, ...data } } = matter(file.content)
        return new Page(pathname, content, layout, data)
    }

    constructor(pathname: PathLike, content: string, layout: string, data: Record<string, unknown>) {
        this._path = path.join(pathname)
        this._content = content
        this._layout = layout
        this._data = data
    }

    public get path(): Path {
        return this._path
    }

    public get content(): string {
        return this._content
    }

    public get data(): Record<string, unknown> {
        return this._data
    }

    public get layout(): string {
        return this._layout
    }
}
