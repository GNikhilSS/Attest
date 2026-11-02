import type { Request, Response, NextFunction } from "express";
import { generateAssessment, LLMServiceError } from "./assessmentGenerator.js";
import { AssessmentInputError } from "./assessmentPrompt.js";
import {
  generateAndSaveAssessment,
  saveAssessmentToQuestionBank,
} from "./assessmentBankService.js";

export const generateAssessmentController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const shouldSave =
      req.query.save === "true" ||
      req.body.save === true ||
      req.body.saveToBank === true;

    if (shouldSave) {
      const options = {
        ...(req.body.skillId ? { skillId: Number(req.body.skillId) } : {}),
        ...(req.body.skillName ? { skillName: String(req.body.skillName) } : {}),
      };
      const persisted = await generateAndSaveAssessment(req.body, options);

      return res.status(201).json({
        success: true,
        message: "Assessment generated and persisted into Question Bank successfully.",
        skill: persisted.skill,
        savedQuestions: persisted.savedQuestions,
        assessment: persisted.fullAssessment,
      });
    }

    const result = await generateAssessment(req.body);

    const view = req.query.view;
    if (view === "employee") {
      return res.status(200).json({
        success: true,
        metadata: result.employeeFacing.metadata,
        questions: result.employeeFacing.questions,
      });
    }

    if (view === "private" || view === "evaluator") {
      return res.status(200).json({
        success: true,
        metadata: result.privateEvaluation.metadata,
        questions: result.privateEvaluation.questions,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof AssessmentInputError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        clarificationNeeded: error.clarificationNeeded,
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
        ...(error.statusCode === 503 || error.statusCode === 429
          ? { retryAfterSeconds: 5 }
          : {}),
      });
    }

    next(error);
  }
};

export const generateAndSaveController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const options = {
      ...(req.body.skillId ? { skillId: Number(req.body.skillId) } : {}),
      ...(req.body.skillName ? { skillName: String(req.body.skillName) } : {}),
    };
    const persisted = await generateAndSaveAssessment(req.body, options);

    return res.status(201).json({
      success: true,
      message: "Assessment generated and persisted into Question Bank successfully.",
      skill: persisted.skill,
      savedQuestions: persisted.savedQuestions,
      assessment: persisted.fullAssessment,
    });
  } catch (error: any) {
    if (error instanceof AssessmentInputError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        clarificationNeeded: error.clarificationNeeded,
      });
    }

    if (error instanceof LLMServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
        ...(error.statusCode === 503 || error.statusCode === 429
          ? { retryAfterSeconds: 5 }
          : {}),
      });
    }

    next(error);
  }
};

export const saveAssessmentController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { assessment, skillId, skillName } = req.body;
    if (!assessment || !assessment.employeeFacing || !assessment.privateEvaluation) {
      return res.status(400).json({
        success: false,
        error: "Missing assessment payload to persist.",
        clarificationNeeded: "Please provide the complete assessment object to save.",
      });
    }

    const options = {
      ...(skillId ? { skillId: Number(skillId) } : {}),
      ...(skillName ? { skillName: String(skillName) } : {}),
    };
    const persisted = await saveAssessmentToQuestionBank(assessment, options);

    return res.status(201).json({
      success: true,
      message: "Existing assessment persisted into Question Bank successfully.",
      skill: persisted.skill,
      savedQuestions: persisted.savedQuestions,
    });
  } catch (error: any) {
    next(error);
  }
};
