import { describe, expect, it } from "vitest";
import { pageFor } from "./routes.js";

describe("pageFor", () => {
  it("returns the about page", () => {
    expect(pageFor("/about").title).toBe("About");
  });
});
