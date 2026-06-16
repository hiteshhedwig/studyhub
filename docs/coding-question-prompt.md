Generate a JSON file of coding practice questions for my Study Hub app.

Category: Perception / Deep Learning
Topic: <PASTE THE ONE TOPIC, e.g. "Tensor mechanics + linear algebra">

Every question must be specifically about the Topic above — not adjacent topics, not a
general mix. If a concept doesn't belong to this exact topic, leave it out.

────────────────────────────────────────────────────────
PHASE 1 — PROPOSE (do NOT output JSON yet)
────────────────────────────────────────────────────────
First, propose a plan as a short list. For each question give:
  • one-line description
  • kind: warmup | implementation
  • framework: numpy | torch
  • difficulty: easy | medium | hard
Group warmups first, then implementations. Then STOP and ask me to confirm or edit.
Only after I reply "go" (or with edits) do you move to Phase 2.

Composition to aim for (not a hard cap — scale to the topic):
  • warmups: as many as the topic's syntax surface needs — 10–20+ is fine. These are
    1–2 line "get my hands comfortable" tasks: a single op, a slice, a reshape, an axis
    arg, completing a call. Mostly easy.
  • implementation: ~6–10 full-function questions, easy→hard.
  • Framework mix: mostly numpy, but deliberately include torch questions where the
    topic naturally maps to torch APIs (nn, functional, optim, autograd, tensor ops).

────────────────────────────────────────────────────────
PHASE 2 — GENERATE (after my confirmation)
────────────────────────────────────────────────────────
Output ONLY valid JSON (no fences, no commentary) in this schema:

{
  "category": "<category>",
  "topic": "<topic>",
  "title": "<short title for this set>",
  "source": "ChatGPT",
  "questions": [
    {
      "type": "code",
      "kind": "warmup" | "implementation",
      "framework": "numpy" | "torch",
      "question": "<problem statement — explain what to do, include math if needed>",
      "difficulty": "easy" | "medium" | "hard",
      "tags": ["<tag1>", "<tag2>"],
      "starter_code": "<python with the import + signature/blank ending in pass>",
      "solution": "<complete working solution, with inline comments>",
      "test_cases": [ ... see rules below ... ]
    }
  ]
}

Rules — solutions:
- Every question must be specifically about the Topic above. If a concept doesn't belong
  to this exact topic, leave it out.
- The solution must include inline comments explaining the WHY of each non-trivial step —
  the reasoning/math, not just what the line does. E.g.
  `# subtract row max so exp() can't overflow on large logits`, not `# subtract max`.
  Comment the intent of every formula, reshape, and axis choice.

Rules — numpy questions (framework: "numpy") → these RUN, so tests must be real:
- Pure numpy, deterministic only. No randomness a test reads: no random init, dropout,
  or sampling. If inputs/weights are needed, hard-code them in `setup` or np.random.seed().
- 2–3 test cases: normal case, edge case, and a shape/dtype check. Each test_case:
    { "description": "...", "setup": "...", "call": "...",
      "expected_shape": [..]  OR  "expected_value": "np.array([...])" }
- Compared with np.allclose (atol=1e-6) — make sure the solution matches to that tolerance.
- For stability-sensitive ops (softmax, log-sum-exp, cross-entropy, log/exp): use the
  numerically STABLE form, and include one test_case with extreme inputs (e.g. 1000, -1000)
  that would overflow a naive version.

Rules — torch questions (framework: "torch") → these do NOT run (torch is mocked):
- Do NOT write expected_value/expected_shape run-tests — they can't execute.
- Only use real torch 2.1 APIs from torch / torch.nn / torch.nn.functional / torch.optim,
  with valid signatures and argument names.
- test_cases here describe what a correct solution must contain (the API/shape the answer
  should produce), as plain "description" entries — no setup/call/expected execution.

Rules — warmups (kind: "warmup"):
- 1–2 lines of real work. starter_code leaves exactly the gap to fill. numpy warmups still
  get a runnable test_case; torch warmups follow the torch rules above.
