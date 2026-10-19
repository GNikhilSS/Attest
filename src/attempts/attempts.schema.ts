import z from "zod";

export const AttemptCreationSchema = z.object({
    skillId: z.number().int().positive("Skill ain't proper"),
    proficiencyLevel: z.number().int().min(1, "Profi aint more").max(5, "Profi aint less")
})
