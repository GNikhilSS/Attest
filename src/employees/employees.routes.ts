import { Router } from "express";
import { getAllEmployees, assignManager } from "./employees.controller.js";
import { requireRole } from "../auth/auth.middleware.js";

export const employeesRouter = Router();

// Only Super Admin can view employee list and assign managers
employeesRouter.get('/', requireRole('SUPER_ADMIN'), getAllEmployees);

employeesRouter.patch('/:employeeId/manager', requireRole('SUPER_ADMIN'), assignManager);