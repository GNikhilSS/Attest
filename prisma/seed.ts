import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, QuestionType, Visibility } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clear tables in dependency order so the seed can be re-run.
  await prisma.submission.deleteMany();
  await prisma.attemptQuestion.deleteMany();
  await prisma.attemptEvent.deleteMany();
  await prisma.attempt.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.question.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.employee.deleteMany();

  // Manager first, then the employee who reports to them.
  const manager = await prisma.employee.create({
    data: { name: "Manager One" },
  });
  await prisma.employee.create({
    data: { name: "Employee One", managedById: manager.id },
  });

  const nodeSkill = await prisma.skill.create({
    data: { skillName: "Node.js" },
  });

  // DEBUG question: the candidate fixes the starter code.
  await prisma.question.create({
    data: {
      skillId: nodeSkill.id,
      proficiencyLevel: 2,
      questionType: QuestionType.DEBUG,
      questionContent:
        "The function should return the sum of an array of numbers. Fix the bug.",
      starterCode:
        "function sum(arr) {\n  let total = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    total += arr[i];\n  }\n  return total;\n}",
      testCases: {
        create: [
          { input: "[1,2,3]", expectedOutput: "6", visibility: Visibility.VISIBLE },
          { input: "[]", expectedOutput: "0", visibility: Visibility.VISIBLE },
          { input: "[5,5]", expectedOutput: "10", visibility: Visibility.HIDDEN_A },
        ],
      },
    },
  });

  // SCRATCH question: the candidate writes the function from the spec.
  await prisma.question.create({
    data: {
      skillId: nodeSkill.id,
      proficiencyLevel: 2,
      questionType: QuestionType.SCRATCH,
      questionContent:
        "Write a function reverseString(s) that returns the string reversed.",
      starterCode: null,
      testCases: {
        create: [
          { input: '"abc"', expectedOutput: '"cba"', visibility: Visibility.VISIBLE },
          { input: '""', expectedOutput: '""', visibility: Visibility.VISIBLE },
          { input: '"hello"', expectedOutput: '"olleh"', visibility: Visibility.HIDDEN_A },
        ],
      },
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());