import Configuration from "@/core/Configuration"
import EventEmitter from "@/core/EventEmitter"


interface Plugin {
    name: string
    install(events: EventEmitter, configuration: Configuration): any
}

export const Signal = () => {
    let resolve = (_?: unknown): void => void 0,
        reject = (_?: unknown): void => void 0
    const signal = new Promise((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
    })
    return { signal, resolve, reject }
}


export default Plugin
