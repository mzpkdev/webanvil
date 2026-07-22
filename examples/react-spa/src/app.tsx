import { useState } from "react"

export const App = () => {
    const [count, setCount] = useState(0)

    return (
        <main>
            <h1>WebAnvil React SPA</h1>
            <button onClick={() => setCount((value) => value + 1)} type="button">
                Count: {count}
            </button>
        </main>
    )
}
