export type TorchFnSpec = {
  signature: string;
  params?: Array<{ name: string; type: string; required: boolean; default?: unknown }>;
  returns?: string;
  numpy_equiv?: string | null;
};

export type TorchModuleSpec = Record<string, TorchFnSpec>;

export type TorchApiSpec = {
  version: string;
  modules: Record<string, TorchModuleSpec>;
};

export function parseTorchSpec(json: string): TorchApiSpec | null {
  try {
    const obj = JSON.parse(json) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (typeof o.version !== "string" || typeof o.modules !== "object") return null;
    return o as unknown as TorchApiSpec;
  } catch {
    return null;
  }
}

export function getTorchSpecFunctionCount(spec: TorchApiSpec): number {
  return Object.values(spec.modules).reduce((sum, mod) => sum + Object.keys(mod).length, 0);
}

function pyLiteral(val: unknown): string {
  if (val === null || val === undefined) return "None";
  if (typeof val === "boolean") return val ? "True" : "False";
  if (typeof val === "string") return JSON.stringify(val);
  return String(val);
}

/**
 * Generate a Python string that registers a `torch` mock in sys.modules.
 * Functions with `numpy_equiv` run the real numpy operation (best-effort).
 * Functions without just return a stub _TorchTensor.
 */
export function getTorchMockPython(spec: TorchApiSpec): string {
  const lines: string[] = [];

  lines.push("import sys as _sys, numpy as _np");
  lines.push("class _TorchTensor:");
  lines.push("    def __init__(self, data=None):");
  lines.push("        self._data = _np.array(data) if data is not None else _np.array([])");
  lines.push("    @property");
  lines.push("    def shape(self): return self._data.shape");
  lines.push("    @property");
  lines.push("    def dtype(self): return self._data.dtype");
  lines.push("    def __repr__(self): return f'tensor({self._data!r})'");
  lines.push("    def numpy(self): return self._data");
  lines.push("    def __add__(self, o): return _TorchTensor(self._data + (o._data if isinstance(o, _TorchTensor) else o))");
  lines.push("    def __mul__(self, o): return _TorchTensor(self._data * (o._data if isinstance(o, _TorchTensor) else o))");
  lines.push("    def __matmul__(self, o): return _TorchTensor(_np.matmul(self._data, o._data if isinstance(o, _TorchTensor) else o))");
  // _u unwraps a TorchTensor to its numpy backing array; must be after _TorchTensor
  lines.push("def _u(v): return v._data if isinstance(v, _TorchTensor) else _np.asarray(v)");
  lines.push("");

  for (const [moduleName, fns] of Object.entries(spec.modules)) {
    const className = `_Mock_${moduleName.replace(/\./g, "_")}`;
    lines.push(`class ${className}:`);
    lines.push("    Tensor = _TorchTensor");

    for (const [fnName, fnSpec] of Object.entries(fns)) {
      // *args/**kwargs avoids SyntaxError from specs with bad param ordering or JSON null defaults
      lines.push(`    def ${fnName}(self, *args, **kwargs):`);

      const params = fnSpec.params ?? [];

      if (params.length > 0) {
        // Unpack each named param so numpy_equiv expressions that reference param
        // names (e.g. "input", "dim", "weight") work without modification.
        params.forEach((p, i) => {
          const isTensor = /tensor/i.test(String(p.type ?? ""));
          const fallback = pyLiteral(p.required ? null : (p.default ?? null));
          if (isTensor) {
            lines.push(`        ${p.name} = _u(args[${i}]) if len(args) > ${i} else kwargs.get(${JSON.stringify(p.name)}, _np.array([]))`);
          } else {
            lines.push(`        ${p.name} = args[${i}] if len(args) > ${i} else kwargs.get(${JSON.stringify(p.name)}, ${fallback})`);
          }
        });
      } else {
        // No spec params — provide x/a/b shorthands used in simple numpy_equiv strings
        lines.push("        x = _u(args[0]) if args else _np.array([])");
        lines.push("        a = x");
        lines.push("        b = _u(args[1]) if len(args) > 1 else _np.array([])");
      }

      if (fnSpec.numpy_equiv) {
        // numpy_equiv may be multi-statement (semicolon-separated).
        // Split so intermediate assignments become proper Python statements,
        // and only the final expression is wrapped in _TorchTensor().
        const stmts = fnSpec.numpy_equiv.split(";").map((s) => s.trim()).filter(Boolean);
        lines.push("        try:");
        for (let i = 0; i < stmts.length - 1; i++) {
          lines.push(`            ${stmts[i]}`);
        }
        lines.push(`            return _TorchTensor(${stmts[stmts.length - 1]})`);
        lines.push("        except Exception: return _TorchTensor()");
      } else {
        lines.push("        return _TorchTensor()");
      }
    }

    lines.push("    def __getattr__(self, name): return lambda *a, **k: _TorchTensor()");
    lines.push("");
  }

  for (const moduleName of Object.keys(spec.modules)) {
    const className = `_Mock_${moduleName.replace(/\./g, "_")}`;
    lines.push(`_sys.modules[${JSON.stringify(moduleName)}] = ${className}()`);
  }

  if (spec.modules["torch"]) {
    lines.push("_sys.modules['torch'].Tensor = _TorchTensor");
  }

  lines.push("del _sys");
  lines.push("");

  return lines.join("\n");
}
