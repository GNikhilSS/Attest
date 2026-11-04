import "dotenv/config";
import { generateAssessment } from "./assessmentGenerator.js";
import { AssessmentInputError } from "./assessmentPrompt.js";
import { saveAssessmentToQuestionBank } from "./assessmentBankService.js";
import type { QuestionType } from "../../generated/prisma/enums.js";

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      const val = nextArg && !nextArg.startsWith("--") ? (i++, nextArg) : "true";
      parsed[key] = val;
    }
  }
  return parsed;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));

  const language = args.language || args.lang || args.tech || process.argv[2];
  const levelStr = args.level || args.proficiency || process.argv[3];
  const topic = args.topic || args.focus;
  const shouldSave = args.save === "true" || args.persist === "true";
  const skillId = args.skillId ? Number(args.skillId) : undefined;

  const questionsFormat = args.spec
  ? args.spec.split(",").map((part) => {
      const [type, count] = part.split(":");
      return { type: type as QuestionType, count: Number(count) };
    })
  : undefined;

  if (!language || !levelStr) {
    console.log(`
============================================================
           ATTEST — Programming Assessment Generator
============================================================
Usage:
  npx tsx src/assessment/cli.ts --language <language> --level <1-5> [--topic <topic>] [--save]

Options:
  --language, --lang    Programming language or technology
  --level, --proficiency Proficiency level (1 to 5)
  --topic, --focus      Optional specific topic or area
  --save                Directly persist DEBUG & SCRATCH questions into Question Bank
  --skillId             Target an existing Skill ID (optional)

Proficiency Levels:
  1 - Novice: Basic terminology, syntax, and simple constructs.
  2 - Learning: Common language features and straightforward debugging.
  3 - Skilled: Practical problem-solving, data structures, and moderately complex debugging.
  4 - Highly Skilled: Advanced features, subtle defects, performance, and design trade-offs.
  5 - Mastery: Deep technical reasoning, complex edge cases, and advanced language behavior.

Examples:
  npx tsx src/assessment/cli.ts --language "JavaScript" --level 2
  npx tsx src/assessment/cli.ts --language "Python" --level 2 --save
  npx tsx src/assessment/cli.ts --language "Python" --level 3 --topic "AsyncIO" --save
============================================================
`);
    process.exit(1);
  }

  const proficiencyLevel = Number(levelStr);

  console.log(`\n⏳ Generating few question practical assessment for ${language} at Level ${proficiencyLevel} using Gemini 3.5 Flash...`);

  try {
    const result = await generateAssessment({
      language,
      proficiencyLevel,
      topic,
      questionsFormat,
    });

    console.log(`\n============================================================`);
    console.log(`  1. EMPLOYEE-FACING ASSESSMENT`);
    console.log(`============================================================`);
    console.log(`Language: ${result.employeeFacing.metadata.language}`);
    console.log(`Level: ${result.employeeFacing.metadata.proficiencyLevel} (${result.employeeFacing.metadata.proficiencyLevelName})`);
    console.log(`Summary: ${result.employeeFacing.metadata.summary}`);
    console.log(`Total Questions: ${result.employeeFacing.metadata.totalQuestions}`);
    console.log(`\n--- Questions (Candidate View) ---`);

    for (const q of result.employeeFacing.questions) {
      console.log(`\n[Question ${q.questionNumber}] [${q.questionType}] ${q.title}`);
      console.log(`Problem:\n${q.problemStatement}`);
      if (q.questionType === "DEBUG") {
        console.log(`Buggy Code:\n\`\`\`\n${q.buggyCode}\n\`\`\``);
        console.log(`Visible Tests:`, JSON.stringify(q.visibleTestCases, null, 2));
      } else if (q.questionType === "SCRATCH") {
        if (q.starterCode) console.log(`Starter Code:\n\`\`\`\n${q.starterCode}\n\`\`\``);
        if (q.constraints?.length) console.log(`Constraints:`, q.constraints);
        console.log(`Visible Tests:`, JSON.stringify(q.visibleTestCases, null, 2));
      } else if (q.questionType === "MCQ") {
        if (q.codeSnippet) console.log(`Code:\n\`\`\`\n${q.codeSnippet}\n\`\`\``);
        for (const opt of q.options) console.log(`  ${opt.id}. ${opt.text}`);
      }
    }

    console.log(`\n============================================================`);
    console.log(`  2. PRIVATE EVALUATION PACKAGE (CONFIDENTIAL)`);
    console.log(`============================================================`);
    console.log(`Model: ${result.privateEvaluation.metadata.evaluatedModel}`);
    console.log(`Timestamp: ${result.privateEvaluation.metadata.generatedAt}`);

    for (const q of result.privateEvaluation.questions) {
      console.log(`\n[Evaluation for Question ${q.questionNumber}] [${q.questionType}] ${q.title}`);
      if (q.questionType === "DEBUG") {
        console.log(`Root Cause:\n${q.rootCause}`);
        console.log(`Corrected Code Reference:\n\`\`\`\n${q.correctedCode}\n\`\`\``);
        console.log(`Hidden Tests:`, JSON.stringify(q.hiddenTestCases, null, 2));
      } else if (q.questionType === "SCRATCH") {
        console.log(`Reference Solution:\n\`\`\`\n${q.referenceSolution}\n\`\`\``);
        console.log(`Hidden Tests:`, JSON.stringify(q.hiddenTestCases, null, 2));
      } else if (q.questionType === "MCQ") {
        console.log(`Correct Option: ${q.correctOptionId}`);
        console.log(`Explanation:\n${q.explanation}`);
        console.log(`Wrong Option Reasons:`, JSON.stringify(q.wrongOptionReasons, null, 2));
      }
      console.log(`Grading Rubric (${q.totalPoints} points total):`, JSON.stringify(q.gradingRubric, null, 2));
    }

    // Direct persistence if --save flag is provided
    if (shouldSave) {
      console.log(`\n============================================================`);
      console.log(`  3. DIRECT QUESTION BANK PERSISTENCE`);
      console.log(`============================================================`);
      console.log(`💾 Saving generated questions to database...`);
      const persistence = await saveAssessmentToQuestionBank(result, { skillId });
      console.log(`✅ Saved into Skill "${persistence.skill.skillName}" (ID: ${persistence.skill.id})`);
      for (const sq of persistence.savedQuestions) {
        console.log(`   - Saved [${sq.questionType}] "${sq.title}" (Question ID: ${sq.id}) with ${sq.visibleTestCases} visible tests and ${sq.hiddenTestCases} hidden tests.`);
      }
    }

    console.log(`\n============================================================`);
    console.log(` Assessment generation complete!`);
    console.log(`============================================================\n`);
  } catch (err: any) {
    if (err instanceof AssessmentInputError) {
      console.error(`\n❌ Input Error: ${err.message}`);
      console.error(`👉 Clarification needed: ${err.clarificationNeeded}\n`);
    } else {
      console.error(`\n❌ Error generating assessment:`, err.message);
    }
    process.exit(1);
  }
}

runCli();
