import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Two managers with no manager of their own.
  const priya = await prisma.employee.create({ data: { name: "Priya Sharma" } });
  const arjun = await prisma.employee.create({ data: { name: "Arjun Mehta" } });

  // Employees reporting to each manager.
  await prisma.employee.createMany({
    data: [
      { name: "Ravi Kumar", managedById: priya.id },
      { name: "Sneha Iyer", managedById: priya.id },
      { name: "Vikram Rao", managedById: arjun.id },
      { name: "Anita Das", managedById: arjun.id },
    ],
  });

  console.log("Employees added.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());