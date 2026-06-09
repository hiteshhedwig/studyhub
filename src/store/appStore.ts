import { create } from "zustand";
import { resetDatabase } from "../db/database";
import {
  addCheatsheet,
  completePomodoro,
  completeRevision,
  createCategory,
  createTopic,
  deleteCheatsheet,
  deleteQuestion,
  deleteQuestionSet,
  deleteSession,
  deleteTopic,
  endSession,
  importQuestionSet,
  importQuestionSetForTopic,
  getTopicAttempts,
  loadDashboardData,
  previewQuestionSetText,
  recordReview,
  addNote,
  addQuestion,
  deleteNote,
  exportPracticeQuestions,
  exportDueTopicReviews,
  mergePracticeAttempts,
  startSession,
  toggleBookmark,
  updateCheatsheetTitle,
  updateNote,
  updateQuestion,
  updateQuestionSetText,
  updateSessionNotes,
  updateTopic,
  type DashboardData
} from "../db/repositories/studyRepository";
import type { Question, ReviewRating, StudySession, Topic } from "../db/repositories/types";
import type { QuestionImport } from "../services/importQuestions";
import { DEFAULT_ACCENT, isAccentId, type AccentId } from "../services/accentPresets";

type ThemePreference = "warm-dark" | "soft-light" | "system";

type AppState = DashboardData & {
  activeSession: StudySession | null;
  theme: ThemePreference;
  accent: AccentId;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  setAccent: (accent: AccentId) => void;
  createCategory: typeof createCategory;
  createTopic: typeof createTopic;
  updateTopic: typeof updateTopic;
  startSession: typeof startSession;
  updateSessionNotes: typeof updateSessionNotes;
  completePomodoro: typeof completePomodoro;
  endSession: typeof endSession;
  addCheatsheet: typeof addCheatsheet;
  importQuestionSet: typeof importQuestionSet;
  recordReview: typeof recordReview;
  completeRevision: typeof completeRevision;
  deleteQuestion: typeof deleteQuestion;
  deleteQuestionSet: typeof deleteQuestionSet;
  deleteCheatsheet: typeof deleteCheatsheet;
  updateCheatsheetTitle: typeof updateCheatsheetTitle;
  updateQuestionSetText: typeof updateQuestionSetText;
  previewQuestionSetText: typeof previewQuestionSetText;
  getTopicAttempts: typeof getTopicAttempts;
  toggleBookmark: typeof toggleBookmark;
  addQuestion: typeof addQuestion;
  updateQuestion: typeof updateQuestion;
  addNote: typeof addNote;
  updateNote: typeof updateNote;
  deleteNote: typeof deleteNote;
  exportPracticeQuestions: typeof exportPracticeQuestions;
  exportDueTopicReviews: typeof exportDueTopicReviews;
  mergePracticeAttempts: typeof mergePracticeAttempts;
  importQuestionSetForTopic: typeof importQuestionSetForTopic;
  deleteSession: typeof deleteSession;
  deleteTopic: typeof deleteTopic;
  resetAll: () => Promise<void>;
};

const emptyData: DashboardData = {
  categories: [],
  topics: [],
  sessions: [],
  cheatsheets: [],
  questionSets: [],
  questions: [],
  revisions: [],
  links: [],
  notes: []
};

// Shared with the desktop-cat window (separate webview) so it can quote your notes
// while it naps, without opening the DB itself. localStorage is shared across Tauri
// windows, and a `storage` event lets the cat pick up edits live.
const NOTES_CACHE_KEY = "study-hub-notes-cache";

/** Flatten a note into the human-readable lines worth quoting (title + item texts). */
function noteToQuotes(note: { title: string; items_json: string }): string[] {
  const lines: string[] = [];
  if (note.title.trim()) lines.push(note.title.trim());
  try {
    for (const item of JSON.parse(note.items_json) as { text?: string }[]) {
      if (item?.text?.trim()) lines.push(item.text.trim());
    }
  } catch {
    // malformed items_json — the title (if any) still counts
  }
  return lines.map((line) => (line.length > 90 ? `${line.slice(0, 89)}…` : line));
}

async function refresh(set: (partial: Partial<AppState>) => void) {
  const data = await loadDashboardData();
  const activeSession = data.sessions.find((session) => !session.ended_at) ?? null;
  set({ ...data, activeSession, isLoading: false, error: null });
  try {
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(data.notes.flatMap(noteToQuotes)));
  } catch {
    // non-fatal — the cat simply has nothing to quote
  }
}

function wrap<T extends (...args: never[]) => Promise<unknown>>(set: (partial: Partial<AppState>) => void, fn: T) {
  return (async (...args: Parameters<T>) => {
    const result = await fn(...args);
    await refresh(set);
    return result;
  }) as T;
}

export const useAppStore = create<AppState>((set) => ({
  ...emptyData,
  activeSession: null,
  theme: (localStorage.getItem("study-hub-theme") as ThemePreference | null) ?? "warm-dark",
  accent: (() => {
    const stored = localStorage.getItem("study-hub-accent");
    return isAccentId(stored) ? stored : DEFAULT_ACCENT;
  })(),
  isLoading: true,
  error: null,
  load: async () => {
    try {
      await refresh(set);
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : "Study Hub could not open the local database." });
    }
  },
  setTheme: (theme) => {
    localStorage.setItem("study-hub-theme", theme);
    set({ theme });
  },
  setAccent: (accent) => {
    localStorage.setItem("study-hub-accent", accent);
    set({ accent });
  },
  createCategory: wrap(set, createCategory),
  createTopic: wrap(set, createTopic),
  updateTopic: wrap(set, updateTopic),
  startSession: wrap(set, startSession),
  updateSessionNotes: wrap(set, updateSessionNotes),
  completePomodoro: wrap(set, completePomodoro),
  endSession: wrap(set, endSession),
  addCheatsheet: wrap(set, addCheatsheet),
  importQuestionSet: wrap(set, importQuestionSet),
  recordReview: wrap(set, recordReview),
  completeRevision: wrap(set, completeRevision),
  deleteQuestion: wrap(set, deleteQuestion),
  deleteQuestionSet: wrap(set, deleteQuestionSet),
  deleteCheatsheet: wrap(set, deleteCheatsheet),
  updateCheatsheetTitle: wrap(set, updateCheatsheetTitle),
  updateQuestionSetText: wrap(set, updateQuestionSetText),
  previewQuestionSetText,
  getTopicAttempts,
  toggleBookmark: wrap(set, toggleBookmark),
  addQuestion: wrap(set, addQuestion),
  updateQuestion: wrap(set, updateQuestion),
  addNote: wrap(set, addNote),
  updateNote: wrap(set, updateNote),
  deleteNote: wrap(set, deleteNote),
  exportPracticeQuestions,
  exportDueTopicReviews,
  mergePracticeAttempts: wrap(set, mergePracticeAttempts),
  importQuestionSetForTopic: wrap(set, importQuestionSetForTopic),
  deleteSession: wrap(set, deleteSession),
  deleteTopic: wrap(set, deleteTopic),
  resetAll: async () => {
    await resetDatabase();
    await refresh(set);
  }
}));

export type { Question, ReviewRating, Topic, ThemePreference };
