import { describe, it, expect } from "vitest";
import {
  validateAssessmentInput,
  buildAssessmentPrompt,
  AssessmentInputError,
} from "./assessmentPrompt.js";
import { PROFICIENCY_LEVELS } from "./assessment.types.js";

describe("Assessment Input Validation", () => {
  it("rejects null or non-object payloads", () => {
    expect(() => validateAssessmentInput(null)).toThrow(AssessmentInputError);
    expect(() => validateAssessmentInput("string")).toThrow(AssessmentInputError);
  });

  it("rejects missing or empty language and asks for clarification", () => {
    try {
      validateAssessmentInput({ proficiencyLevel: 2 });
      expect.unreachable("Should have thrown AssessmentInputError");
    } catch (e: any) {
      expect(e).toBeInstanceOf(AssessmentInputError);
      expect(e.clarificationNeeded).toContain("Please specify the programming language or technology");
    }

    try {
      validateAssessmentInput({ language: "   ", proficiencyLevel: 2 });
      expect.unreachable("Should have thrown AssessmentInputError");
    } catch (e: any) {
      expect(e).toBeInstanceOf(AssessmentInputError);
      expect(e.clarificationNeeded).toContain("Please specify the programming language or technology");
    }
  });

  it("rejects invalid proficiency levels (< 1 or > 5 or non-integers) and asks for clarification", () => {
    const invalidLevels = [0, 6, 2.5, "abc", null, -1];
    for (const lvl of invalidLevels) {
      try {
        validateAssessmentInput({ language: "Python", proficiencyLevel: lvl });
        expect.unreachable(`Should have thrown for level ${lvl}`);
      } catch (e: any) {
        expect(e).toBeInstanceOf(AssessmentInputError);
        expect(e.clarificationNeeded).toContain("Please provide a valid proficiency level from 1 to 5");
      }
    }
  });

  it("accepts valid inputs for all levels 1 to 5", () => {
    for (let level = 1; level <= 5; level++) {
      const validated = validateAssessmentInput({
        language: "TypeScript",
        proficiencyLevel: level,
      });
      expect(validated.language).toBe("TypeScript");
      expect(validated.proficiencyLevel).toBe(level);
    }
  });

  it("preserves optional topic when provided", () => {
    const validated = validateAssessmentInput({
      language: "Node.js",
      proficiencyLevel: 3,
      topic: "Streams and Buffers",
    });
    expect(validated.topic).toBe("Streams and Buffers");
  });
});

describe("Assessment Prompt Construction", () => {
  it("constructs prompt matching required 2-question practical coding distribution", () => {
    const prompt = buildAssessmentPrompt({
      language: "JavaScript",
      proficiencyLevel: 2,
    });

    expect(prompt).toContain("Generate exactly two practical coding questions");
    expect(prompt).toContain("Question 1: One debugging and code-correction question");
    expect(prompt).toContain("Question 2: One coding-from-scratch question");
  });

  it("calibrates proficiency level definition in prompt", () => {
    const prompt = buildAssessmentPrompt({
      language: "Python",
      proficiencyLevel: 4,
    });

    const level4 = PROFICIENCY_LEVELS[4];
    expect(prompt).toContain("Highly Skilled");
    expect(prompt).toContain(level4.description);
  });

  it("strictly enforces exactly 2 visible test cases and 1 hidden test case", () => {
    const prompt = buildAssessmentPrompt({
      language: "Python",
      proficiencyLevel: 3,
    });

    expect(prompt).toContain("Exactly TWO (2) visible test cases");
    expect(prompt).toContain("Exactly ONE (1) hidden test case");
    expect(prompt).toContain("hiddenTestCases");
    expect(prompt).toContain("visibleTestCases");
    expect(prompt).toContain("Hidden Set A");
  });
});
