import App from "./App.svelte"

export default {
    component: App,
    title: "App"
}

export const Default = {
    play: async ({
        canvas,
        userEvent
    }: {
        canvas: { getByRole: (role: string) => Element }
        userEvent: { click: (element: Element) => Promise<void> }
    }) => {
        await userEvent.click(canvas.getByRole("button"))
    }
}
