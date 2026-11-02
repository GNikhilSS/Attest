/**
 * Execution Harness Generator
 *
 * In coding assessments, candidates submit function definitions (e.g. `def solution(nums): ...`)
 * without reading stdin or calling print()/console.log().
 *
 * Judge0 runs code as standalone CLI scripts. Without a runner harness, functions are defined
 * but never invoked, yielding empty stdout and failing all test cases.
 *
 * This utility wraps candidate code with an automated stdin-reading and stdout-printing runner.
 */

export function wrapWithHarness(
  sourceCode: string,
  languageId: number
): string {
  if (!sourceCode || typeof sourceCode !== "string") {
    return sourceCode;
  }

  // Language 71 = Python 3, 70 = Python 2
  if (languageId === 71 || languageId === 70) {
    return wrapPython(sourceCode);
  }

  // Language 63 = JavaScript (Node.js), 74 = TypeScript
  if (languageId === 63 || languageId === 74) {
    return wrapJavaScript(sourceCode);
  }

  // For other languages or raw scripts, return unmodified
  return sourceCode;
}

function wrapPython(code: string): string {
  // If the code already has an entry point or main block, do not alter it
  if (code.includes('if __name__ == "__main__":') || code.includes("if __name__ == '__main__':")) {
    return code;
  }

  // Find user-defined function names (top-level def)
  const matches = [...code.matchAll(/^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\):/gm)];
  if (matches.length === 0) {
    return code;
  }

  // Choose the last defined function as the entry point
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch || !lastMatch[1]) {
    return code;
  }
  const functionName = lastMatch[1];

  const harness = `

# --- Judge0 Evaluation Harness ---
if __name__ == "__main__":
    import sys, json, inspect, ast, re

    def _invoke():
        _raw = sys.stdin.read().strip()
        _sig = inspect.signature(${functionName})
        _param_names = list(_sig.parameters.keys())
        _param_count = len(_param_names)

        # 1. Try JSON
        try:
            _data = json.loads(_raw)
            if isinstance(_data, list) and _param_count > 1 and len(_data) == _param_count:
                return ${functionName}(*_data)
            elif isinstance(_data, dict) and all(k in _data for k in _param_names):
                return ${functionName}(**_data)
            elif _param_count == 1:
                return ${functionName}(_data)
        except Exception:
            pass

        # 2. Try python variable assignments (e.g. 'scores = [...], threshold = 50')
        if "=" in _raw:
            try:
                _scope = {}
                _code_str = re.sub(r',\\s*([a-zA-Z_]\\w*\\s*=)', r'\\n\\1', _raw)
                exec(_code_str, _scope)
                _kwargs = {k: _scope[k] for k in _param_names if k in _scope}
                if len(_kwargs) == _param_count:
                    return ${functionName}(**_kwargs)
                elif _param_count == 1 and len(_scope) >= 1:
                    return ${functionName}(list(_scope.values())[0])
            except Exception:
                pass

        # 3. Try ast.literal_eval (e.g. tuple '[1, 2], 5' or single literal)
        try:
            _val = ast.literal_eval(_raw)
            if isinstance(_val, tuple) and _param_count > 1 and len(_val) == _param_count:
                return ${functionName}(*_val)
            elif _param_count == 1:
                return ${functionName}(_val)
        except Exception:
            pass

        # 4. Fallbacks
        if _raw == "" and _param_count == 0:
            return ${functionName}()
        return ${functionName}(_raw)

    try:
        _result = _invoke()
        if _result is not None:
            if isinstance(_result, (dict, list, bool)):
                print(json.dumps(_result))
            else:
                print(_result)
    except Exception as _e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
`;

  return code + harness;
}

function wrapJavaScript(code: string): string {
  // If code already logs output, do not interfere
  if (code.includes("console.log(") && !code.includes("function")) {
    return code;
  }

  // Find function declaration or const fn = (...) =>
  const funcMatch =
    code.match(/(?:function\s+([a-zA-Z_][a-zA-Z0-9_]*)|(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:function|\([^)]*\)\s*=>|[a-zA-Z0-9_]+\s*=>))/);

  const functionName = funcMatch ? (funcMatch[1] || funcMatch[2]) : null;
  if (!functionName) {
    return code;
  }

  const harness = `

// --- Judge0 Evaluation Harness ---
(() => {
  const fs = require('fs');
  const rawInput = fs.readFileSync(0, 'utf-8').trim();
  let parsed;
  try {
    parsed = JSON.parse(rawInput);
  } catch (e) {
    parsed = rawInput;
  }

  if (typeof ${functionName} === 'function') {
    let result;
    if (Array.isArray(parsed) && ${functionName}.length > 1 && parsed.length === ${functionName}.length) {
      result = ${functionName}(...parsed);
    } else if (rawInput === '' && ${functionName}.length === 0) {
      result = ${functionName}();
    } else {
      result = ${functionName}(parsed);
    }

    if (result !== undefined) {
      console.log(typeof result === 'object' ? JSON.stringify(result) : result);
    }
  }
})();
`;

  return code + harness;
}

