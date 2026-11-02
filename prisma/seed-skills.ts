import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SKILLS_TO_SEED = [
  "Node.js",
  "Python",
  "Java",
  "C++",
  "TypeScript",
  "Go",
  "SQL",
];

async function main() {
  console.log("Seeding skills into database...");

  for (const skillName of SKILLS_TO_SEED) {
    const existing = await prisma.skill.findUnique({
      where: { skillName },
    });

    if (!existing) {
      const created = await prisma.skill.create({
        data: { skillName },
      });
      console.log(`+ Created Skill: ${created.skillName} (ID: ${created.id})`);
    } else {
      console.log(`= Existing Skill: ${existing.skillName} (ID: ${existing.id})`);
    }
  }

  const allSkills = await prisma.skill.findMany({
    orderBy: { id: "asc" },
  });

  console.log("\nCurrent skills in DB:");
  for (const s of allSkills) {
    console.log(` - ID ${s.id}: ${s.skillName}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

