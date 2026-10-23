import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AppError, errorHandler } from "./errors.js";

describe("errorHandler centralized middleware", () => {
  const createMockRes = () => {
    let statusCode = 200;
    let jsonBody: any = null;
    const res: any = {
      status: vi.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: vi.fn((data: any) => {
        jsonBody = data;
        return res;
      }),
    };
    return { res: res as Response, getStatus: () => statusCode, getBody: () => jsonBody };
  };

  it("handles custom AppError instances with custom status code", () => {
    const { res, getStatus, getBody } = createMockRes();
    const error = new AppError(400, "Custom bad request");

    errorHandler(error, {} as Request, res, vi.fn());

    expect(getStatus()).toBe(400);
    expect(getBody()).toEqual({ message: "Custom bad request" });
  });

  it("maps known domain error ATTEMPT_NOT_FOUND to 404", () => {
    const { res, getStatus, getBody } = createMockRes();
    errorHandler(new Error("ATTEMPT_NOT_FOUND"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(404);
    expect(getBody()).toEqual({ message: "Attempt not found" });
  });

  it("maps known domain error FORBIDDEN or UNAUTHORIZED_MANAGER to 403", () => {
    const { res, getStatus, getBody } = createMockRes();
    errorHandler(new Error("FORBIDDEN"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(403);
    expect(getBody()).toEqual({ message: "Forbidden" });
  });

  it("maps INVALID_TRANSITION errors to 409 Conflict", () => {
    const { res, getStatus, getBody } = createMockRes();
    errorHandler(new Error("INVALID_TRANSITION: CREATED -> SUBMITTED by EMPLOYEE"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(409);
    expect(getBody()).toEqual({ message: "Attempt cannot transition in its current state" });
  });

  it("maps DEADLINE_PASSED to 409 Conflict", () => {
    const { res, getStatus, getBody } = createMockRes();
    errorHandler(new Error("DEADLINE_PASSED"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(409);
    expect(getBody()).toEqual({ message: "Exam deadline has passed" });
  });

  it("maps REJECTION_REASON_REQUIRED to 400 Bad Request", () => {
    const { res, getStatus, getBody } = createMockRes();
    errorHandler(new Error("REJECTION_REASON_REQUIRED"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(400);
    expect(getBody()).toEqual({ message: "Rejection reason is required" });
  });

  it("handles unexpected generic errors with 500 Server error", () => {
    const { res, getStatus, getBody } = createMockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandler(new Error("Database connection dropped unexpectedly"), {} as Request, res, vi.fn());

    expect(getStatus()).toBe(500);
    expect(getBody()).toEqual({ message: "Server error" });
    spy.mockRestore();
  });
});

