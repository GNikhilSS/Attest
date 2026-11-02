import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js"
import { PASS_SALT } from "../src/lib/env.js";

export const changePassword = async () => {
    const commonPassword = await bcrypt.hash("Attest123", PASS_SALT)


    const employees = await prisma.employee.updateMany({
        where: {
            password: "$2b$10$xmqHE5vExqZcBkopZF5aleVMa8Gj./aip2dWr7aPQc78trRJabJ5y"
        },
        data: {
            password: commonPassword
        }
    });

    console.log(employees);
};

changePassword();