import type { CodeTestCase } from "../db/repositories/types";

export type RunResult = {
  stdout: string;
  stderr: string;
  error: string | null;
  testResults: Array<{
    description: string;
    passed: boolean;
    actual?: string;
    error?: string;
  }>;
};

type WorkerRequest = {
  id: string;
  code: string;
  testCases: CodeTestCase[];
  torchMockCode: string;
};

type WorkerResponse = RunResult & { id: string };

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (r: RunResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/pyodide.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(e.data.id);
      const { id: _id, ...result } = e.data;
      entry.resolve(result);
    };
    worker.onerror = (e) => {
      // On fatal worker error, reject all pending and reset
      pending.forEach((entry) => {
        clearTimeout(entry.timer);
        entry.reject(new Error(e.message ?? "Worker crashed"));
      });
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

const TIMEOUT_MS = 30_000;

export function runCode(opts: { code: string; testCases?: CodeTestCase[]; torchMockCode?: string }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      // Kill and reset worker on timeout
      worker?.terminate();
      worker = null;
      reject(new Error("Execution timed out after 30 seconds."));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });

    const req: WorkerRequest = {
      id,
      code: opts.code,
      testCases: opts.testCases ?? [],
      torchMockCode: opts.torchMockCode ?? ""
    };

    getWorker().postMessage(req);
  });
}
