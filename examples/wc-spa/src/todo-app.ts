import { css, html, LitElement } from "lit"

type Todo = {
    id: string
    text: string
    completed: boolean
}

export class TodoApp extends LitElement {
    static properties = {
        todos: { state: true }
    }

    static styles = css`
    :host {
      color: #1f2937;
      display: grid;
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      place-items: center;
    }

    main {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 12px 32px rgb(15 23 42 / 12%);
      max-width: 36rem;
      padding: 2rem;
      width: min(100% - 2rem, 36rem);
    }

    form {
      display: flex;
      gap: 0.75rem;
    }

    input[type='text'] {
      border: 1px solid #9ca3af;
      border-radius: 8px;
      flex: 1;
      font: inherit;
      padding: 0.65rem 0.8rem;
    }

    button {
      background: #2563eb;
      border: 0;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font: inherit;
      padding: 0.65rem 1rem;
    }

    ul {
      display: grid;
      gap: 0.5rem;
      list-style: none;
      margin: 1.5rem 0;
      padding: 0;
    }

    li {
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem 0;
    }

    li span {
      flex: 1;
    }

    li.completed span {
      color: #6b7280;
      text-decoration: line-through;
    }

    .remove,
    .clear {
      background: transparent;
      color: #b91c1c;
      padding: 0.25rem;
    }

    footer {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }
  `

    private declare todos: Todo[]

    constructor() {
        super()
        this.todos = [
            { id: "learn-lit", text: "Learn Lit", completed: true },
            { id: "build-webanvil", text: "Try WebAnvil", completed: false }
        ]
    }

    private addTodo(event: Event): void {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        const text = new FormData(form).get("todo")?.toString().trim()

        if (!text) return

        this.todos = [...this.todos, { id: crypto.randomUUID(), text, completed: false }]
        form.reset()
    }

    private toggleTodo(id: string): void {
        this.todos = this.todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo))
    }

    private removeTodo(id: string): void {
        this.todos = this.todos.filter((todo) => todo.id !== id)
    }

    private clearCompleted(): void {
        this.todos = this.todos.filter((todo) => !todo.completed)
    }

    render() {
        const completed = this.todos.filter((todo) => todo.completed).length

        return html`
      <main>
        <h1>Todos</h1>
        <form @submit=${this.addTodo}>
          <input aria-label="New todo" name="todo" placeholder="What needs doing?" required type="text" />
          <button type="submit">Add</button>
        </form>
        <ul>
          ${this.todos.map(
              (todo) => html`
              <li class=${todo.completed ? "completed" : ""}>
                <input
                  aria-label=${`Mark ${todo.text} complete`}
                  .checked=${todo.completed}
                  @change=${() => this.toggleTodo(todo.id)}
                  type="checkbox"
                />
                <span>${todo.text}</span>
                <button class="remove" @click=${() => this.removeTodo(todo.id)} type="button">Remove</button>
              </li>
            `
          )}
        </ul>
        <footer>
          <span>${completed} of ${this.todos.length} completed</span>
          <button ?disabled=${completed === 0} class="clear" @click=${this.clearCompleted} type="button">
            Clear completed
          </button>
        </footer>
      </main>
    `
    }
}

customElements.define("todo-app", TodoApp)
