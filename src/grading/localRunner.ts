import vm from "node:vm";
import type { Judge0SubmissionRequest, Judge0SubmissionResult } from "./judge0Client.js";

const standardGlobals = new Set([
  "console",
  "JSON",
  "Math",
  "stdin",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Date",
  "RegExp",
]);

export function executeLocalCode(request: Judge0SubmissionRequest): Judge0SubmissionResult {
  const token = `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();
  let stdout = "";
  let stderr = "";

  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => {
        stdout += args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") + "\n";
      },
      error: (...args: unknown[]) => {
        stderr += args.map(String).join(" ") + "\n";
      },
    },
    JSON,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Array,
    String,
    Number,
    Boolean,
    Object,
    Date,
    RegExp,
    stdin: request.stdin,
  };

  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(request.source_code, context, { timeout: 2000 });

    if (!stdout.trim()) {
      const userFunctions = Object.entries(context).filter(
        ([k, v]) => typeof v === "function" && !standardGlobals.has(k)
      );

      const lastFnEntry = userFunctions[userFunctions.length - 1];
      if (lastFnEntry && typeof lastFnEntry[1] === "function") {
        const fn = lastFnEntry[1] as (...args: unknown[]) => unknown;
        let parsedInput: unknown;
        try {
          parsedInput = JSON.parse(request.stdin);
        } catch {
          parsedInput = request.stdin;
        }

        const res = fn(parsedInput);
        if (res !== undefined) {
          stdout = JSON.stringify(res);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
    return {
      token,
      status: { id: 3, description: "Accepted" },
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
      compile_output: null,
      time: elapsed,
      memory: 1024,
    };
  } catch (error: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
    const isTimeout =
      error?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ||
      error?.message?.includes("timed out");

    if (isTimeout) {
      return {
        token,
        status: { id: 5, description: "Time Limit Exceeded" },
        stdout: null,
        stderr: "Time Limit Exceeded (2000ms)",
        compile_output: null,
        time: elapsed,
        memory: 1024,
      };
    }

    return {
      token,
      status: { id: 11, description: "Runtime Error" },
      stdout: null,
      stderr: error?.message || "Execution error",
      compile_output: null,
      time: elapsed,
      memory: 1024,
    };
  }
}

