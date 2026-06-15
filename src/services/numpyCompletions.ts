import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete";

// ── numpy function registry ──────────────────────────────────────────────────

type Fn = { sig: string; doc?: string };
type FnMap = Record<string, Fn>;

const NP: FnMap = {
  // Array creation
  "array":        { sig: "(object, dtype=None, copy=True)", doc: "Create an ndarray from a sequence." },
  "zeros":        { sig: "(shape, dtype=float)", doc: "Return a new array of given shape, filled with zeros." },
  "ones":         { sig: "(shape, dtype=None)", doc: "Return a new array of given shape, filled with ones." },
  "zeros_like":   { sig: "(a, dtype=None)", doc: "Return an array of zeros with the same shape and type as a given array." },
  "ones_like":    { sig: "(a, dtype=None)", doc: "Return an array of ones with the same shape and type as a given array." },
  "full":         { sig: "(shape, fill_value, dtype=None)", doc: "Return a new array of given shape filled with fill_value." },
  "full_like":    { sig: "(a, fill_value, dtype=None)" },
  "empty":        { sig: "(shape, dtype=float)", doc: "Return a new array without initializing entries." },
  "empty_like":   { sig: "(prototype, dtype=None)" },
  "eye":          { sig: "(N, M=None, k=0, dtype=float)", doc: "Return a 2-D identity matrix." },
  "identity":     { sig: "(n, dtype=None)" },
  "arange":       { sig: "(start, stop, step=1, dtype=None)", doc: "Return evenly spaced values within a given interval." },
  "linspace":     { sig: "(start, stop, num=50, endpoint=True)", doc: "Return evenly spaced numbers over a specified interval." },
  "logspace":     { sig: "(start, stop, num=50, base=10.0)" },
  "meshgrid":     { sig: "(*xi, indexing='xy')" },

  // Random
  "random.randn": { sig: "(*d)", doc: "Return samples from the standard normal distribution." },
  "random.rand":  { sig: "(*d)", doc: "Random values in [0, 1) uniform distribution." },
  "random.randint": { sig: "(low, high=None, size=None)" },
  "random.uniform": { sig: "(low=0.0, high=1.0, size=None)" },
  "random.normal":  { sig: "(loc=0.0, scale=1.0, size=None)" },
  "random.seed":    { sig: "(seed=None)" },
  "random.choice":  { sig: "(a, size=None, replace=True, p=None)" },
  "random.shuffle": { sig: "(x)" },

  // Math
  "dot":     { sig: "(a, b)", doc: "Dot product of two arrays." },
  "matmul":  { sig: "(x1, x2)", doc: "Matrix product of two arrays." },
  "einsum":  { sig: "(subscripts, *operands)", doc: "Evaluates the Einstein summation convention." },
  "inner":   { sig: "(a, b)" },
  "outer":   { sig: "(a, b)" },
  "exp":     { sig: "(x)", doc: "Calculate the exponential of all elements in the input array." },
  "log":     { sig: "(x)", doc: "Natural logarithm, element-wise." },
  "log2":    { sig: "(x)" },
  "log10":   { sig: "(x)" },
  "sqrt":    { sig: "(x)" },
  "abs":     { sig: "(x)" },
  "absolute":{ sig: "(x)" },
  "power":   { sig: "(x1, x2)", doc: "First array elements raised to powers from second array." },
  "square":  { sig: "(x)" },
  "maximum": { sig: "(x1, x2)", doc: "Element-wise maximum of array elements." },
  "minimum": { sig: "(x1, x2)", doc: "Element-wise minimum of array elements." },
  "clip":    { sig: "(a, a_min, a_max)", doc: "Clip (limit) the values in an array." },
  "round":   { sig: "(a, decimals=0)" },
  "floor":   { sig: "(x)" },
  "ceil":    { sig: "(x)" },
  "sign":    { sig: "(x)" },
  "mod":     { sig: "(x1, x2)" },
  "divide":  { sig: "(x1, x2)" },
  "multiply":{ sig: "(x1, x2)" },
  "add":     { sig: "(x1, x2)" },
  "subtract":{ sig: "(x1, x2)" },

  // Aggregation
  "sum":     { sig: "(a, axis=None, keepdims=False)", doc: "Sum of array elements over a given axis." },
  "prod":    { sig: "(a, axis=None, keepdims=False)" },
  "mean":    { sig: "(a, axis=None, keepdims=False)" },
  "std":     { sig: "(a, axis=None, ddof=0, keepdims=False)" },
  "var":     { sig: "(a, axis=None, ddof=0, keepdims=False)" },
  "max":     { sig: "(a, axis=None, keepdims=False)" },
  "min":     { sig: "(a, axis=None, keepdims=False)" },
  "argmax":  { sig: "(a, axis=None)" },
  "argmin":  { sig: "(a, axis=None)" },
  "nanmean": { sig: "(a, axis=None)" },
  "nansum":  { sig: "(a, axis=None)" },
  "cumsum":  { sig: "(a, axis=None)" },
  "cumprod": { sig: "(a, axis=None)" },
  "diff":    { sig: "(a, n=1, axis=-1)" },

  // Shape / manipulation
  "reshape":      { sig: "(a, newshape)", doc: "Gives a new shape to an array without changing its data." },
  "transpose":    { sig: "(a, axes=None)", doc: "Permute the dimensions of an array." },
  "squeeze":      { sig: "(a, axis=None)", doc: "Remove axes of length one." },
  "expand_dims":  { sig: "(a, axis)", doc: "Expand the shape of an array." },
  "ravel":        { sig: "(a, order='C')" },
  "concatenate":  { sig: "(a_tuple, axis=0)", doc: "Join a sequence of arrays along an existing axis." },
  "stack":        { sig: "(arrays, axis=0)", doc: "Join a sequence of arrays along a new axis." },
  "vstack":       { sig: "(tup)", doc: "Stack arrays in sequence vertically (row wise)." },
  "hstack":       { sig: "(tup)", doc: "Stack arrays in sequence horizontally (column wise)." },
  "split":        { sig: "(ary, indices_or_sections, axis=0)" },
  "roll":         { sig: "(a, shift, axis=None)" },
  "pad":          { sig: "(array, pad_width, mode='constant', **kwargs)" },
  "tile":         { sig: "(A, reps)" },
  "repeat":       { sig: "(a, repeats, axis=None)" },
  "flip":         { sig: "(m, axis=None)" },
  "rot90":        { sig: "(m, k=1, axes=(0, 1))" },

  // Logical / comparison
  "all":          { sig: "(a, axis=None)" },
  "any":          { sig: "(a, axis=None)" },
  "where":        { sig: "(condition, x=None, y=None)", doc: "Return elements chosen from x or y depending on condition." },
  "nonzero":      { sig: "(a)" },
  "isnan":        { sig: "(x)" },
  "isinf":        { sig: "(x)" },
  "isfinite":     { sig: "(x)" },
  "logical_and":  { sig: "(x1, x2)" },
  "logical_or":   { sig: "(x1, x2)" },
  "logical_not":  { sig: "(x)" },
  "equal":        { sig: "(x1, x2)" },
  "greater":      { sig: "(x1, x2)" },
  "less":         { sig: "(x1, x2)" },
  "allclose":     { sig: "(a, b, rtol=1e-05, atol=1e-08)", doc: "Returns True if two arrays are element-wise equal within a tolerance." },
  "isclose":      { sig: "(a, b, rtol=1e-05, atol=1e-08)" },

  // Sorting / search
  "sort":         { sig: "(a, axis=-1)" },
  "argsort":      { sig: "(a, axis=-1)" },
  "unique":       { sig: "(ar, return_index=False, return_inverse=False, return_counts=False)" },
  "bincount":     { sig: "(x, weights=None, minlength=0)" },
  "searchsorted": { sig: "(a, v, side='left')" },

  // Linear algebra
  "linalg.norm":        { sig: "(x, ord=None, axis=None, keepdims=False)" },
  "linalg.inv":         { sig: "(a)", doc: "Compute the inverse of a matrix." },
  "linalg.pinv":        { sig: "(a)" },
  "linalg.det":         { sig: "(a)" },
  "linalg.eig":         { sig: "(a)" },
  "linalg.eigh":        { sig: "(a)" },
  "linalg.svd":         { sig: "(a, full_matrices=True, compute_uv=True)" },
  "linalg.solve":       { sig: "(a, b)" },
  "linalg.lstsq":       { sig: "(a, b, rcond=None)" },
  "linalg.matrix_rank": { sig: "(A, tol=None)" },
  "linalg.qr":          { sig: "(a, mode='reduced')" },
  "linalg.cholesky":    { sig: "(a)" },

  // Trig
  "sin":    { sig: "(x)" },
  "cos":    { sig: "(x)" },
  "tan":    { sig: "(x)" },
  "arcsin": { sig: "(x)" },
  "arccos": { sig: "(x)" },
  "arctan": { sig: "(x)" },
  "arctan2":{ sig: "(x1, x2)" },
  "sinh":   { sig: "(x)" },
  "cosh":   { sig: "(x)" },
  "tanh":   { sig: "(x)", doc: "Hyperbolic tangent, element-wise." },

  // Type / dtype
  "asarray":      { sig: "(a, dtype=None)" },
  "astype":       { sig: "(dtype, copy=True)" },
  "float32":      { sig: "" },
  "float64":      { sig: "" },
  "int32":        { sig: "" },
  "int64":        { sig: "" },
  "uint8":        { sig: "" },
  "bool_":        { sig: "" },
};

// ── completion source ────────────────────────────────────────────────────────

// Pre-build completion items once
const NP_ITEMS: Completion[] = Object.entries(NP).map(([name, fn]) => ({
  label: name,
  type: "function",
  detail: fn.sig,
  info: fn.doc,
}));

/** CodeMirror completion source that triggers on `np.<cursor>` */
export function numpyCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match "np." followed by any word chars (including "." for submodules like linalg.norm)
  const match = context.matchBefore(/np\.[\w.]*/);
  if (!match) return null;

  return {
    from: match.from + 3, // position just after "np."
    options: NP_ITEMS,
    validFor: /^[\w.]*$/,
  };
}
