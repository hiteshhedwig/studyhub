import type { TorchApiSpec } from "./torchMock";
import { parseTorchSpec } from "./torchMock";

const TORCH_SPEC_KEY = "study-hub-torch-api-spec";
const AUTOCOMPLETE_KEY = "study-hub-code-autocomplete";

export function getTorchApiSpec(): TorchApiSpec | null {
  try {
    const raw = localStorage.getItem(TORCH_SPEC_KEY);
    if (!raw) return null;
    return parseTorchSpec(raw);
  } catch {
    return null;
  }
}

export function setTorchApiSpec(json: string) {
  try {
    localStorage.setItem(TORCH_SPEC_KEY, json);
  } catch {
    // ignore
  }
}

export function clearTorchApiSpec() {
  try {
    localStorage.removeItem(TORCH_SPEC_KEY);
  } catch {
    // ignore
  }
}

/** Autocomplete enabled by default. */
export function getAutocompleteEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOCOMPLETE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutocompleteEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTOCOMPLETE_KEY, enabled ? "on" : "off");
  } catch {
    // ignore
  }
}
