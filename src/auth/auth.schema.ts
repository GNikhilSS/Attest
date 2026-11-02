import z from "zod";

export const LoginSchema = z.object({
    employeeId: z.number().int().positive("Invalid creds (Id)"),
    password: z
      .string()
      .min(4, "Password should have minimum length of 4")
      .max(16, "Password is too long")
      .regex(/^(?=.*[A-Z]).{4,}$/, "Should Contain at least one uppercase letter and have a minimum length of 4 characters.")
})

export const RegisterSchema = z.object({
    employeeName: z
      .string()
      .min(4)
      .max(25)
      .regex(/^[a-zA-Z0-9_-]{4,25}$/),
    password: z
      .string()
      .min(4, "Password should have minimum length of 4")
      .max(16, "Password is too long")
      .regex(/^(?=.*[A-Z]).{4,16}$/, "Should Contain at least one uppercase letter and have a minimum length of 4 characters.")
})