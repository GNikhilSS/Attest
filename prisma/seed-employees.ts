import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const manager = await prisma.employee.create({
    data: {
      name: "POC Manager",
      reports: {
        create: { name: "POC Employee" },
      },
    },
    include: { reports: true },
  });

  console.log(`Manager login ID: ${manager.id} (${manager.name})`);
  for (const employee of manager.reports) {
    console.log(`Employee login ID: ${employee.id} (${employee.name}), managed by ${manager.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());