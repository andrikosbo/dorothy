import { describe, expect, it } from "vitest";
import { classifyViberMessagePosition } from "./viber.js";

describe("Viber message ownership", () => {
  it("classifies left bubbles as incoming and right bubbles as outgoing", () => {
    expect(classifyViberMessagePosition(2010, 1604, 863)).toBe(false);
    expect(classifyViberMessagePosition(2385, 1604, 863)).toBe(true);
  });
});
