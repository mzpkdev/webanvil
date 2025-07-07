import * as nodepath from "path"
import Path, { PathLike } from "../core/Path"


export const cwd = () => {
    return new Path(process.cwd())
}

export const join = (...path: PathLike[]) => {
    return new Path(nodepath.join(...path.map(String)))
}