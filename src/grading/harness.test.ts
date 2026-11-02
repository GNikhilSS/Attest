import { describe, expect, it } from "vitest";
import { wrapWithHarness } from "./harness.js";

describe("harness generator", () => {
  describe("Python (71)", () => {
    it("wraps a function definition with an execution runner", () => {
      const code = `def solution(nums):\n    return sum(nums)`;
      const wrapped = wrapWithHarness(code, 71);
      expect(wrapped).toContain('if __name__ == "__main__":');
      expect(wrapped).toContain("solution(");
      expect(wrapped).toContain("json.loads");
    });

    it("does not re-wrap code that already defines a main block", () => {
      const code = `def solve():\n    pass\n\nif __name__ == '__main__':\n    print(1)`;
      const wrapped = wrapWithHarness(code, 71);
      expect(wrapped).toBe(code);
    });

    it("leaves script code with no function unchanged", () => {
      const code = `import sys\nprint("hello")`;
      const wrapped = wrapWithHarness(code, 71);
      expect(wrapped).toBe(code);
    });
  });

  describe("JavaScript (63)", () => {
    it("wraps a function declaration with an execution runner", () => {
      const code = `function solve(arr) {\n  return arr.length;\n}`;
      const wrapped = wrapWithHarness(code, 63);
      expect(wrapped).toContain("fs.readFileSync");
      expect(wrapped).toContain("solve(");
      expect(wrapped).toContain("console.log(");
    });

    it("wraps an arrow function assignment", () => {
      const code = `const compute = (x) => x * 2;`;
      const wrapped = wrapWithHarness(code, 63);
      expect(wrapped).toContain("fs.readFileSync");
      expect(wrapped).toContain("compute(");
    });
  });

  describe("Other languages", () => {
    it("returns raw code unmodified for C++ or Java", () => {
      const cpp = `#include <iostream>\nint main() { return 0; }`;
      expect(wrapWithHarness(cpp, 54)).toBe(cpp);
    });
  });
});
