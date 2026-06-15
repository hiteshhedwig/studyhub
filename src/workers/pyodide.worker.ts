/// <reference lib="webworker" />

type TestCase = {
  description: string;
  setup: string;
  call: string;
  expected_shape?: number[];
  expected_value?: string;
};

type RunRequest = {
  id: string;
  code: string;
  testCases: TestCase[];
  torchMockCode: string;
};

type TestResult = {
  description: string;
  passed: boolean;
  actual?: string;
  error?: string;
};

type RunResponse = {
  id: string;
  stdout: string;
  stderr: string;
  error: string | null;
  testResults: TestResult[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;

async function ensurePyodide() {
  if (pyodide) return pyodide;
  // @ts-expect-error dynamic CDN import
  const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.mjs");
  pyodide = await loadPyodide();
  await pyodide.loadPackage("numpy");
  return pyodide;
}

// Test cases are passed as a JSON string to avoid JsProxy subscript issues.
const TEST_RUNNER_PY = `
import json as _json, numpy as _np
_test_cases = _json.loads(__test_cases_json__)
_results = []
for _tc in _test_cases:
    try:
        _ns = dict(globals())
        exec(_tc["setup"], _ns)
        _result = eval(_tc["call"], _ns)
        _passed = True
        _actual = repr(_result)
        if "expected_shape" in _tc:
            _shape = list(getattr(_result, "shape", []))
            _passed = _shape == list(_tc["expected_shape"])
        elif "expected_value" in _tc:
            try:
                _expected = eval(_tc["expected_value"], _ns)
                _passed = bool(_np.allclose(_result, _expected))
            except Exception:
                _passed = _result == eval(_tc["expected_value"], _ns)
        _results.append({"description": _tc["description"], "passed": _passed, "actual": _actual})
    except Exception as _e:
        _results.append({"description": _tc["description"], "passed": False, "error": str(_e)})
print("__TEST_RESULTS__:" + _json.dumps(_results))
`;

async function runCode(req: RunRequest): Promise<RunResponse> {
  const py = await ensurePyodide();

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  py.setStdout({ batched: (line: string) => stdoutLines.push(line) });
  py.setStderr({ batched: (line: string) => stderrLines.push(line) });

  let error: string | null = null;
  let testResults: TestResult[] = [];

  try {
    // Run torch mock injection first (empty string when no spec loaded)
    if (req.torchMockCode) {
      await py.runPythonAsync(req.torchMockCode);
    }

    // Run user code
    await py.runPythonAsync(req.code);

    // Run tests if any
    if (req.testCases.length > 0) {
      // Pass as JSON string — avoids JsProxy subscript errors when iterating in Python
      py.globals.set("__test_cases_json__", JSON.stringify(req.testCases));
      await py.runPythonAsync(TEST_RUNNER_PY);

      // Extract __TEST_RESULTS__ line from stdout
      const idx = stdoutLines.findIndex((l) => l.startsWith("__TEST_RESULTS__:"));
      if (idx !== -1) {
        const raw = stdoutLines[idx].slice("__TEST_RESULTS__:".length);
        testResults = JSON.parse(raw) as TestResult[];
        stdoutLines.splice(idx, 1);
      }
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  return {
    id: req.id,
    stdout: stdoutLines.join("\n"),
    stderr: stderrLines.join("\n"),
    error,
    testResults
  };
}

self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const result = await runCode(e.data);
  self.postMessage(result);
};
