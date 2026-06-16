/// <reference lib="webworker" />

type TestCase = {
  description: string;
  setup: string;
  call: string;
  expected_shape?: number[];
  expected_value?: string;
};

type ShapeVar = {
  shape: number[];
  dtype: string;
  status: "new" | "changed";
  from?: number[];
};

type ShapeTraceLine = {
  line: number;
  vars: Record<string, ShapeVar>;
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
  shapeTrace: ShapeTraceLine[];
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
        _actual = ""
        if "expected_shape" in _tc:
            _shape = list(getattr(_result, "shape", []))
            _passed = _shape == list(_tc["expected_shape"])
            if not _passed:
                _actual = f"got shape {_shape}, expected {list(_tc['expected_shape'])}"
        elif "expected_value" in _tc:
            try:
                _expected = eval(_tc["expected_value"], _ns)
                _passed = bool(_np.allclose(_result, _expected))
                if not _passed:
                    _actual = f"shape {list(_result.shape)}, values differ" if hasattr(_result, "shape") else repr(_result)[:120]
            except Exception:
                try:
                    _passed = bool(_result == eval(_tc["expected_value"], _ns))
                except Exception:
                    _passed = False
                if not _passed:
                    _actual = repr(_result)[:120]
        _results.append({"description": _tc["description"], "passed": _passed, "actual": _actual})
    except Exception as _e:
        _results.append({"description": _tc["description"], "passed": False, "error": str(_e)})
print("__TEST_RESULTS__:" + _json.dumps(_results))
`;

// Re-executes user code with sys.settrace to capture per-line numpy shape flow.
// Key points:
//   - Most DL questions wrap logic in a function that's never called at the top
//     level, so we also drive the first test case to enter the function body.
//   - We pre-compile the user code and exec the SAME compiled object so that
//     frame.f_code IDs match the ones in _user_code_ids (exec'ing a string
//     re-compiles and produces different IDs — that was the original bug).
//   - Per-frame state handles nested calls; 'return' event catches the last line.
const SHAPE_TRACE_PY = `
import sys as _sys, json as _json, numpy as _np

_shape_log = []
_frame_state = {}

def _collect_code_ids(co):
    seen = {id(co)}
    stack = [co]
    while stack:
        c = stack.pop()
        for const in c.co_consts:
            if hasattr(const, 'co_consts') and id(const) not in seen:
                seen.add(id(const))
                stack.append(const)
    return seen

_compiled = compile(__shape_code__, '<user>', 'exec')
_user_code_ids = _collect_code_ids(_compiled)

def _line_tracer(frame, event, arg):
    if id(frame.f_code) not in _user_code_ids:
        return None
    fid = id(frame)
    if fid not in _frame_state:
        _frame_state[fid] = {'prev_line': None, 'prev_shapes': {}}
    state = _frame_state[fid]
    cur = {}
    for k, v in frame.f_locals.items():
        if not k.startswith('_') and isinstance(v, _np.ndarray):
            cur[k] = [list(v.shape), str(v.dtype)]
    if event in ('line', 'return') and state['prev_line'] is not None:
        changed = {}
        for k, (sh, dt) in cur.items():
            prev = state['prev_shapes'].get(k)
            if prev is None:
                changed[k] = {'shape': sh, 'dtype': dt, 'status': 'new'}
            elif prev[0] != sh:
                changed[k] = {'shape': sh, 'dtype': dt, 'status': 'changed', 'from': prev[0]}
        if changed:
            _shape_log.append({'line': state['prev_line'], 'vars': changed})
    if event == 'return':
        del _frame_state[fid]
        return _line_tracer
    if event == 'line':
        state['prev_line'] = frame.f_lineno
        state['prev_shapes'] = cur
    return _line_tracer

def _call_tracer(frame, event, arg):
    if event == 'call':
        return _line_tracer
    return None

_trace_ns = {'__builtins__': __builtins__}
_sys.settrace(_call_tracer)
try:
    exec(_compiled, _trace_ns)
    _tests = _json.loads(__shape_tests__)
    if _tests:
        _tc = _tests[0]
        try:
            exec(_tc.get('setup', ''), _trace_ns)
            if _tc.get('call'):
                eval(_tc['call'], _trace_ns)
        except Exception:
            pass
finally:
    _sys.settrace(None)

print("__SHAPE_TRACE__:" + _json.dumps(_shape_log))
`;

async function runCode(req: RunRequest): Promise<RunResponse> {
  const py = await ensurePyodide();

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  py.setStdout({ batched: (line: string) => stdoutLines.push(line) });
  py.setStderr({ batched: (line: string) => stderrLines.push(line) });

  let error: string | null = null;
  let testResults: TestResult[] = [];
  let shapeTrace: ShapeTraceLine[] = [];

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

    // Shape trace: re-run user code with sys.settrace to capture per-line shape flow.
    // Only for numpy questions (torch imports produce _TorchTensor, not np.ndarray).
    // Stdout is redirected to a private buffer so the re-run doesn't pollute user output.
    const isTorch = req.code.includes("import torch") || req.code.includes("from torch");
    if (!isTorch) {
      const traceLines: string[] = [];
      py.setStdout({ batched: (line: string) => traceLines.push(line) });
      py.globals.set("__shape_code__", req.code);
      py.globals.set("__shape_tests__", JSON.stringify(req.testCases));
      await py.runPythonAsync(SHAPE_TRACE_PY);
      py.setStdout({ batched: (line: string) => stdoutLines.push(line) });

      const traceIdx = traceLines.findIndex((l) => l.startsWith("__SHAPE_TRACE__:"));
      if (traceIdx !== -1) {
        const raw = traceLines[traceIdx].slice("__SHAPE_TRACE__:".length);
        shapeTrace = JSON.parse(raw) as ShapeTraceLine[];
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
    testResults,
    shapeTrace
  };
}

self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const result = await runCode(e.data);
  self.postMessage(result);
};
