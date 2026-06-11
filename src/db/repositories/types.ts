export type TopicStatus = "learning" | "revising" | "strong" | "mastered";
export type Difficulty = "easy" | "medium" | "hard";
export type ReviewRating = "forgot" | "hard" | "good" | "easy";
export type RevisionStatus = "pending" | "completed" | "missed" | "rescheduled";
export type RevisionType = "topic_review" | "cheatsheet_review" | "question_practice";

export type Category = { id: string; name: string; color: string; created_at: string; updated_at: string };
export type Topic = {
  id: string;
  category_id: string;
  category_name?: string;
  category_color?: string;
  title: string;
  description: string | null;
  status: TopicStatus;
  mastery_score: number;
  created_at: string;
  updated_at: string;
  last_studied_at: string | null;
  last_revised_at: string | null;
  next_revision_at: string | null;
};
export type StudySession = {
  id: string;
  topic_id: string;
  topic_title?: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  focus_minutes: number;
  break_minutes: number;
  pomodoros_completed: number;
  notes: string | null;
  reflection: string | null;
  understanding_rating: number | null;
  difficulty_rating: number | null;
  chatgpt_link: string | null;
  created_at: string;
  // Total real focus time studied this session, in seconds (whole + partial cycles).
  // Source of truth for study minutes — see sessionFocusMinutes. (Historically this
  // held only the partial-phase remainder; legacy/zero rows fall back to
  // focus_minutes × pomodoros_completed.)
  extra_focus_seconds: number;
};
export type Cheatsheet = {
  id: string;
  topic_id: string;
  session_id: string | null;
  topic_title?: string;
  title: string;
  file_path: string;
  file_type: string;
  created_at: string;
  next_revision_at?: string | null;
};
export type QuestionSet = { id: string; topic_id: string; session_id: string | null; title: string; source: string; imported_at: string; raw_json: string; topic_title?: string };
export type Question = {
  id: string;
  question_set_id: string;
  topic_id: string;
  topic_title?: string;
  question: string;
  answer: string;
  difficulty: Difficulty;
  tags_json: string;
  next_due_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  mastery_score: number;
  created_at: string;
  bookmarked?: number;
};
export type RevisionSchedule = {
  id: string;
  topic_id: string;
  session_id: string | null;
  topic_title?: string;
  due_at: string;
  completed_at: string | null;
  type: RevisionType;
  status: RevisionStatus;
  rating: ReviewRating | null;
  created_at: string;
};
export type ResourceLink = { id: string; topic_id: string; session_id: string | null; title: string; url: string; kind: "chatgpt" | "article" | "video" | "docs" | "other"; created_at: string };
export type ReviewAttempt = {
  id: string;
  question_id: string;
  reviewed_at: string;
  rating: ReviewRating;
  user_answer: string | null;
  was_correct: number;
  time_spent_seconds: number;
};
export type QuestionNote = {
  id: string;
  question_id: string;
  body: string;
  rating: ReviewRating | null;
  created_at: string;
  updated_at: string;
};
// `editable` is derived (not stored): a note seals once its question has been
// reviewed at/after the note was written, so prior-encounter notes are read-only.
export type QuestionNoteWithLock = QuestionNote & { editable: boolean };
// One capped review attempt, joined to its topic — windowed to ~the last year
// and fed to the practice/review heatmap on Today. `seconds` is already AFK-capped.
export type ReviewActivityRow = { reviewed_at: string; seconds: number; topic_id: string; topic_title: string };
export type NoteItem = { id: string; text: string; done: boolean };
// (Note + NoteItem are imported by studyRepository.ts)
export type Note = { id: string; title: string; items_json: string; color: string; created_at: string; updated_at: string };
