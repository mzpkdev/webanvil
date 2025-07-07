import * as nodepath from "path"
import * as nodeutil from "util"


export type PathStruct =
    { dir?: string, name?: string, ext?: string }

export type PathLike =
    Path | string

export default class Path {
    private readonly _dir: string
    private readonly _name: string
    private readonly _ext: string

    public static from(path: PathLike | PathStruct, ...segments: PathLike[]): Path {
        if (path instanceof Path) {
            return segments.reduce((pathname: Path, segment) =>
                pathname.join(segment), path)
        } else if (typeof path === "string") {
            return new Path(nodepath.join(path, ...segments.map(String)))
        } else if (typeof path === "object") {
            return new Path(
                nodepath.join(path.dir ?? "", `${path.name ?? ""}${path.ext ?? ""}`)
            )
        } else {
            throw new TypeError("[TODO] Invalid pathname")
        }
    }

    constructor(pathname: string) {
        const { dir, name, ext } = nodepath.parse(pathname)
        this._dir = dir
        this._name = name
        this._ext = ext
    }

    public replace(path: PathLike | PathStruct, replaceValue?: string): Path {
        if (path instanceof Path || typeof path === "string") {
            return new Path(
                String(this.full)
                    .replace(String(path), replaceValue ?? "")
            )
        } else {
            let { dir, name, ext } = path
            if (ext?.charAt(0) === ".") {
                ext = ext.slice(1)
            }
            return new Path(
                nodepath.join(dir ?? this._dir, `${name ?? this._name}.${ext ?? this._ext}`)
            )
        }
    }

    public join(...segments: PathLike[]): Path {
        return new Path(nodepath.join(this.full, ...segments.map(String)))
    }

    public from(to: PathLike): Path {
        return new Path(nodepath.relative(String(this), String(to)))
    }

    public to(from: PathLike): Path {
        return new Path(nodepath.relative(String(from), String(this)))
    }

    public get full(): string {
        return nodepath.join(this._dir, this.base)
    }

    public get base(): string {
        return `${this._name}${this._ext}`
    }

    public get name(): string {
        return this._name
    }

    public set name(value: string) {
        this.replace({ name: value })
    }

    public get ext(): string {
        return this._ext
    }

    public set ext(value: string) {
        this.replace({ ext: value })
    }

    public get dir(): string {
        return this._dir
    }

    public set dir(value: string) {
        this.replace({ dir: value })
    }

    // public path(): string {
    //     return nodepath.join(this._dir, this.base())
    // }
    //
    // public base(): string {
    //     return `${this._name}${this._ext}`
    // }
    //
    // public name(): string
    // public name(value: string): Path
    // public name(value?: string): PathLike {
    //     if (value) {
    //         return this.replace({ name: value })
    //     } else {
    //         return this._name
    //     }
    // }
    //
    // public ext(): string
    // public ext(value: string): Path
    // public ext(value?: string): PathLike {
    //     if (value) {
    //         return this.replace({ ext: value })
    //     } else {
    //         return this._ext
    //     }
    // }
    //
    // public dir(): string
    // public dir(value: string): Path
    // public dir(value?: string): PathLike {
    //     if (value) {
    //         return this.replace({ dir: value })
    //     } else {
    //         return this._dir
    //     }
    // }

    public toString() {
        return this.full
    }

    public valueOf(): string {
        return this.toString()
    }

    public [nodeutil.inspect.custom](): string {
        return this.valueOf()
    }
}
