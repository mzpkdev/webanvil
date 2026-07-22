import { afterEach, describe, expect, it } from "vitest"

import "../src/todo-app"
import type { TodoApp } from "../src/todo-app"

const createApp = async (): Promise<TodoApp> => {
    const app = document.createElement("todo-app") as TodoApp
    document.body.append(app)
    await app.updateComplete
    return app
}

afterEach(() => {
    document.body.replaceChildren()
})

describe("todo-app", () => {
    it("adds a todo", async () => {
        const app = await createApp()
        const form = app.shadowRoot?.querySelector("form") as HTMLFormElement
        const input = app.shadowRoot?.querySelector('input[name="todo"]') as HTMLInputElement

        input.value = "Write tests"
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        await app.updateComplete

        expect(app.shadowRoot?.textContent).toContain("Write tests")
    })

    it("marks a todo as complete", async () => {
        const app = await createApp()
        const checkbox = app.shadowRoot?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]

        checkbox?.click()
        await app.updateComplete

        expect(app.shadowRoot?.querySelectorAll("li")[1]?.classList.contains("completed")).toBe(true)
    })

    it("removes a todo", async () => {
        const app = await createApp()
        const remove = app.shadowRoot?.querySelector<HTMLButtonElement>("button.remove")

        remove?.click()
        await app.updateComplete

        expect(app.shadowRoot?.textContent).not.toContain("Learn Lit")
    })

    it("clears completed todos", async () => {
        const app = await createApp()
        const clear = app.shadowRoot?.querySelector<HTMLButtonElement>("button.clear")

        clear?.click()
        await app.updateComplete

        expect(app.shadowRoot?.textContent).not.toContain("Learn Lit")
        expect(app.shadowRoot?.textContent).toContain("Try Webanvil")
    })
})
