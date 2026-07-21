import "./style.css";
import { pageFor } from "./routes.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Could not find the app element.");
}

const render = () => {
  const page = pageFor(window.location.pathname);

  document.title = `${page.title} | Webanvil SPA`;
  app.innerHTML = `
    <main>
      <p class="eyebrow">Webanvil example</p>
      <h1>${page.title}</h1>
      <p>${page.body}</p>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    </main>
  `;
};

document.addEventListener("click", (event) => {
  const link = (event.target as Element).closest("a");

  if (!link || link.origin !== window.location.origin) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", link.pathname);
  render();
});

window.addEventListener("popstate", render);
render();
