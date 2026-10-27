import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export const getSkills = async (req: Request, res: Response) => {
    const skills = await prisma.skill.findMany();

    res.status(200).json({ skills });
}