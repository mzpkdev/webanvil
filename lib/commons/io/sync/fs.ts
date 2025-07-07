import * as nodefs from "fs"
import Path, { PathLike } from "../core/Path"
import File from "../core/File"


export const dir = (path: PathLike): Path[] => {
    const dirents = nodefs.readdirSync(String(path), { encoding: "utf-8" })
    return dirents.map(dirent => Path.from(path, dirent))
}

export const deepdir = (path: PathLike): Path[] => {
    const dirents = nodefs.readdirSync(String(path), { encoding: "utf-8", recursive: true })
    return dirents.map(dirent => Path.from(path, dirent))
}

export const mkdir = (path: PathLike): void => {
    nodefs.mkdirSync(String(path), { recursive: true })
}

export const exists = (path: PathLike): boolean => {
    return nodefs.existsSync(String(path))
}

export const read = (path: PathLike): File => {
    const content = nodefs.readFileSync(String(path), "utf-8")
    return new File(Path.from(path), content)
}

export const write = (path: PathLike, content: string): void => {
    mkdir(Path.from(path).dir)
    nodefs.writeFileSync(String(path), content, "utf-8")
}

export const rm = (path: PathLike): void => {
    if (exists(path)) {
        nodefs.rmSync(String(path), { recursive: true })
    }
}

export const cp = (source: PathLike, destination: PathLike) => {
    if (exists(source)) {
        nodefs.cpSync(String(source), String(destination), { recursive: true })
    }
}