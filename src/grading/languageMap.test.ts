import { describe, expect, it } from "vitest";
import { resolveLanguageId } from "./languageMap.js";

describe("languageMap", () => {
  it("resolves python to 71", () => {
    expect(resolveLanguageId("Python")).toBe(71);
    expect(resolveLanguageId("python 3")).toBe(71);
    expect(resolveLanguageId("Python Scripting")).toBe(71);
  });

  it("resolves javascript to 63", () => {
    expect(resolveLanguageId("JavaScript")).toBe(63);
    expect(resolveLanguageId("js")).toBe(63);
    expect(resolveLanguageId("Node.js")).toBe(63);
  });

  it("resolves java to 62", () => {
    expect(resolveLanguageId("Java")).toBe(62);
  });

  it("resolves c++ to 54", () => {
    expect(resolveLanguageId("c++")).toBe(54);
    expect(resolveLanguageId("cpp")).toBe(54);
  });

  it("resolves typescript to 74", () => {
    expect(resolveLanguageId("TypeScript")).toBe(74);
  });

  it("falls back gracefully for unknown languages", () => {
    expect(resolveLanguageId("UnknownLanguage")).toBe(71);
    expect(resolveLanguageId(null)).toBe(71);
  });
});

