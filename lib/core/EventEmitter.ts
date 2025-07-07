export enum Event {
    END = "end"
}

export type EventSubscriber =
    (...args: unknown[]) => void


class EventEmitter {
    private readonly events: Map<Event, EventSubscriber[]> = new Map()

    public on(event: Event, subscriber: EventSubscriber): void {
        if (!this.events.has(event)) {
            this.events.set(event, [])
        }
        this.events.get(event)!.push(subscriber)
    }

    public off(event: Event, listener: EventSubscriber): void {
        if (this.events.has(event)) {
            this.events.set(
                event,
                this.events.get(event)!.filter((l) => l !== listener)
            )
        }
    }

    public emit(event: Event, ...args: unknown[]): void {
        if (this.events.has(event)) {
            this.events.get(event)!.forEach((listener) => listener(...args))
        }
    }

    public once(event: Event, subscriber: EventSubscriber): void {
        const onceWrapper: EventSubscriber = (...args) => {
            this.off(event, onceWrapper)
            subscriber(...args)
        }
        this.on(event, onceWrapper)
    }

    public removeAllListeners(event?: Event): void {
        if (event) {
            this.events.delete(event)
        } else {
            this.events.clear()
        }
    }
}


export default EventEmitter
