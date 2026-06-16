import type { Database } from "sql.js";
import { addDays, endOfDay, parseISO } from "date-fns";
import { getDatabase, one, persistDatabase, toRows } from "../database";
import { aggregateReviewRating, calculateQuestionReview, createTopicRevisionDates } from "../../services/spacedRepetition";
import { getActiveExamDate } from "../../services/preferencesService";
import type { Category, Cheatsheet, Difficulty, Note, NoteItem, Question, QuestionNote, QuestionNoteWithLock, QuestionSet, ResourceLink, ReviewActivityRow, ReviewAttempt, ReviewRating, RevisionSchedule, StudySession, Topic, TopicJournalEntry } from "./types";
import type { QuestionImport } from "../../services/importQuestions";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// A single card can't legitimately take more than this — anything longer is the
// card sitting open while you're away, so we clamp it before it skews practice time.
export const PRACTICE_CARD_CAP_SECONDS = 600;
// How far back the review heatmap looks (53 weeks ≈ a full GitHub-style year).
const REVIEW_WINDOW_DAYS = 371;

export type DashboardData = {
  categories: Category[];
  topics: Topic[];
  sessions: StudySession[];
  cheatsheets: Cheatsheet[];
  questionSets: QuestionSet[];
  questions: Question[];
  revisions: RevisionSchedule[];
  links: ResourceLink[];
  notes: Note[];
  reviewActivity: ReviewActivityRow[];
};

async function withDb<T>(fn: (db: Database) => T | Promise<T>, persist = false): Promise<T> {
  const db = await getDatabase();
  const result = await fn(db);
  if (persist) await persistDatabase(db);
  return result;
}

export async function loadDashboardData(): Promise<DashboardData> {
  return withDb((db) => ({
    categories: toRows<Category>(db, "SELECT * FROM Category ORDER BY name"),
    topics: toRows<Topic>(
      db,
      `SELECT Topic.*, Category.name AS category_name, Category.color AS category_color
       FROM Topic JOIN Category ON Category.id = Topic.category_id
       ORDER BY updated_at DESC`
    ),
    sessions: toRows<StudySession>(
      db,
      `SELECT StudySession.*, Topic.title AS topic_title
       FROM StudySession JOIN Topic ON Topic.id = StudySession.topic_id
       ORDER BY started_at DESC`
    ),
    cheatsheets: toRows<Cheatsheet>(
      db,
      `SELECT Cheatsheet.*, Topic.title AS topic_title, Topic.next_revision_at
       FROM Cheatsheet JOIN Topic ON Topic.id = Cheatsheet.topic_id
       ORDER BY created_at DESC`
    ),
    questionSets: toRows<QuestionSet>(
      db,
      `SELECT QuestionSet.*, Topic.title AS topic_title
       FROM QuestionSet JOIN Topic ON Topic.id = QuestionSet.topic_id
       ORDER BY imported_at DESC`
    ),
    questions: toRows<Question>(
      db,
      `SELECT Question.*, Topic.title AS topic_title,
              CASE WHEN Bookmark.question_id IS NOT NULL THEN 1 ELSE 0 END AS bookmarked
       FROM Question
       JOIN Topic ON Topic.id = Question.topic_id
       LEFT JOIN Bookmark ON Bookmark.question_id = Question.id
       ORDER BY next_due_at ASC`
    ),
    revisions: toRows<RevisionSchedule>(
      db,
      `SELECT RevisionSchedule.*, Topic.title AS topic_title
       FROM RevisionSchedule JOIN Topic ON Topic.id = RevisionSchedule.topic_id
       ORDER BY due_at ASC`
    ),
    links: toRows<ResourceLink>(db, "SELECT * FROM ResourceLink ORDER BY created_at DESC"),
    notes: toRows<Note>(db, "SELECT * FROM Note ORDER BY created_at DESC"),
    // Each recall attempt (free practice AND topic-review) joined to its topic,
    // AFK-capped, windowed to the last year — drives the review heatmap on Today.
    reviewActivity: toRows<ReviewActivityRow>(
      db,
      `SELECT a.reviewed_at AS reviewed_at,
              MIN(a.time_spent_seconds, ${PRACTICE_CARD_CAP_SECONDS}) AS seconds,
              q.topic_id AS topic_id,
              Topic.title AS topic_title
       FROM ReviewAttempt a
       JOIN Question q ON q.id = a.question_id
       JOIN Topic ON Topic.id = q.topic_id
       WHERE a.reviewed_at >= ?
       ORDER BY a.reviewed_at`,
      [new Date(Date.now() - REVIEW_WINDOW_DAYS * 86_400_000).toISOString()]
    )
  }));
}

export async function addNote(): Promise<Note> {
  return withDb((db) => {
    const ts = now();
    const note: Note = { id: id(), title: "", items_json: "[]", color: "n1", created_at: ts, updated_at: ts };
    db.run("INSERT INTO Note VALUES (?, ?, ?, ?, ?, ?)", [note.id, note.title, note.items_json, note.color, note.created_at, note.updated_at]);
    return note;
  }, true);
}

export async function updateNote(noteId: string, fields: { title: string; items: NoteItem[]; color: string }) {
  return withDb((db) => {
    db.run("UPDATE Note SET title = ?, items_json = ?, color = ?, updated_at = ? WHERE id = ?", [
      fields.title,
      JSON.stringify(fields.items),
      fields.color,
      now(),
      noteId
    ]);
  }, true);
}

export async function deleteNote(noteId: string) {
  return withDb((db) => db.run("DELETE FROM Note WHERE id = ?", [noteId]), true);
}

export async function createCategory(name: string, color = "#C9A66B") {
  return withDb((db) => {
    const created = { id: id(), name: name.trim(), color, created_at: now(), updated_at: now() };
    db.run("INSERT INTO Category VALUES (?, ?, ?, ?, ?)", [created.id, created.name, created.color, created.created_at, created.updated_at]);
    return created;
  }, true);
}

export async function createTopic(input: { categoryId: string; title: string; description?: string }) {
  return withDb((db) => {
    const createdAt = now();
    const topic = {
      id: id(),
      category_id: input.categoryId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: "learning",
      mastery_score: 10,
      created_at: createdAt,
      updated_at: createdAt,
      last_studied_at: null,
      last_revised_at: null,
      next_revision_at: null
    };
    db.run(
      `INSERT INTO Topic (id, category_id, title, description, status, mastery_score, created_at, updated_at, last_studied_at, last_revised_at, next_revision_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [topic.id, topic.category_id, topic.title, topic.description, topic.status, topic.mastery_score, topic.created_at, topic.updated_at, null, null, null]
    );
    return topic as Topic;
  }, true);
}

export async function updateTopic(input: Pick<Topic, "id" | "title" | "description" | "status" | "mastery_score">) {
  return withDb((db) => {
    db.run("UPDATE Topic SET title = ?, description = ?, status = ?, mastery_score = ?, updated_at = ? WHERE id = ?", [
      input.title,
      input.description,
      input.status,
      input.mastery_score,
      now(),
      input.id
    ]);
  }, true);
}

export async function startSession(input: { topicId: string; title: string; focusMinutes: number; breakMinutes: number; notes?: string }) {
  return withDb((db) => {
    const session = {
      id: id(),
      topic_id: input.topicId,
      title: input.title.trim(),
      started_at: now(),
      ended_at: null,
      focus_minutes: input.focusMinutes,
      break_minutes: input.breakMinutes,
      pomodoros_completed: 0,
      notes: input.notes ?? "",
      reflection: null,
      understanding_rating: null,
      difficulty_rating: null,
      chatgpt_link: null,
      created_at: now(),
      extra_focus_seconds: 0
    };
    db.run(
      `INSERT INTO StudySession VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.topic_id,
        session.title,
        session.started_at,
        session.ended_at,
        session.focus_minutes,
        session.break_minutes,
        session.pomodoros_completed,
        session.notes,
        session.reflection,
        session.understanding_rating,
        session.difficulty_rating,
        session.chatgpt_link,
        session.created_at,
        session.extra_focus_seconds
      ]
    );
    db.run("UPDATE Topic SET last_studied_at = ?, updated_at = ? WHERE id = ?", [session.started_at, now(), input.topicId]);
    return session as StudySession;
  }, true);
}

export async function updateSessionNotes(sessionId: string, notes: string) {
  return withDb((db) => db.run("UPDATE StudySession SET notes = ? WHERE id = ?", [notes, sessionId]), true);
}

export async function completePomodoro(sessionId: string, workMinutes: number, breakMinutes: number) {
  return withDb((db) => {
    const startedAt = now();
    db.run("INSERT INTO PomodoroBlock VALUES (?, ?, ?, ?, ?, ?, ?)", [id(), sessionId, workMinutes, breakMinutes, startedAt, now(), 1]);
    db.run("UPDATE StudySession SET pomodoros_completed = pomodoros_completed + 1 WHERE id = ?", [sessionId]);
  }, true);
}

export async function endSession(input: {
  sessionId: string;
  reflection: string;
  understanding: number;
  difficulty: number;
  chatgptLink?: string;
  scheduleRevisions: boolean;
  // The timer's authoritative full-pomodoro count, reconciled here so cycles
  // completed while away from the Today page (which records them) aren't lost.
  completedCycles?: number;
  // The timer's authoritative *total* focus seconds for the whole session (real
  // elapsed focus time, completed + partial). Stored as the session's focus total
  // so any end path — overlay, early-end, natural completion — records what was
  // actually studied, not just whole completed pomodoros.
  focusSeconds?: number;
}) {
  return withDb((db) => {
    const session = one<StudySession>(db, "SELECT * FROM StudySession WHERE id = ?", [input.sessionId]);
    // Idempotency guard: a double-submit (e.g. double-click on "Finish") must not
    // wrap up the session twice, which would insert a second full set of revisions.
    if (!session || session.ended_at) return;
    const endedAt = now();
    // Never decrease the count — completedCycles is the timer's truth, but the
    // per-cycle recorder may already have banked the same pomodoros.
    const pomodoros = typeof input.completedCycles === "number"
      ? Math.max(session.pomodoros_completed, Math.round(input.completedCycles))
      : session.pomodoros_completed;
    // Total focus seconds studied. Floor it at the completed pomodoros' full length
    // so finished cycles always credit their whole duration even if the live timer
    // total drifted low; fall back to the pomodoro length when no total was passed.
    const pomodoroSeconds = pomodoros * session.focus_minutes * 60;
    const focusSeconds = typeof input.focusSeconds === "number"
      ? Math.max(pomodoroSeconds, Math.round(input.focusSeconds))
      : Math.max(pomodoroSeconds, session.extra_focus_seconds ?? 0);
    db.run(
      `UPDATE StudySession
       SET ended_at = ?, reflection = ?, understanding_rating = ?, difficulty_rating = ?, chatgpt_link = ?, pomodoros_completed = ?, extra_focus_seconds = ?
       WHERE id = ?`,
      [endedAt, input.reflection, input.understanding, input.difficulty, input.chatgptLink ?? null, pomodoros, focusSeconds, input.sessionId]
    );
    if (input.chatgptLink) {
      db.run("INSERT INTO ResourceLink VALUES (?, ?, ?, ?, ?, ?, ?)", [id(), session.topic_id, session.id, "ChatGPT conversation", input.chatgptLink, "chatgpt", now()]);
    }
    if (input.scheduleRevisions) {
      // Re-studying a topic resets its spacing: clear any still-pending topic_review
      // rows first so we don't stack a second ladder on top of the first (which
      // surfaced as duplicate topic reviews for the same topic). Completed reviews
      // are a different status, so the recall history is left untouched.
      db.run("DELETE FROM RevisionSchedule WHERE topic_id = ? AND type = 'topic_review' AND status = 'pending'", [session.topic_id]);
      const dates = createTopicRevisionDates(new Date(endedAt));
      dates.forEach((dueAt) => {
        db.run("INSERT INTO RevisionSchedule VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [id(), session.topic_id, session.id, dueAt, null, "topic_review", "pending", null, now()]);
      });
      db.run("UPDATE Topic SET next_revision_at = ?, status = 'revising', updated_at = ? WHERE id = ?", [dates[0], now(), session.topic_id]);
    }
  }, true);
}

/**
 * Turn the spaced-repetition topic-review ladder on or off for a topic, decoupled
 * from finishing a focus session — so an old topic added through Materials can be
 * pulled into (or out of) the review track from the Topics page.
 *
 * Enabling builds a fresh 1/3/7/14/30/60-day ladder from today; disabling clears the
 * still-pending ladder and stops surfacing the topic in reviews. Only status='pending'
 * topic_review rows are ever touched, so completed reviews (recall history) survive
 * both directions. A mastered topic is never demoted back to 'learning'.
 */
export async function setTopicSpacedRepetition(topicId: string, enabled: boolean) {
  return withDb((db) => {
    const topic = one<Topic>(db, "SELECT * FROM Topic WHERE id = ?", [topicId]);
    if (!topic) return;
    // Always clear the pending ladder first so enabling can't duplicate it.
    db.run("DELETE FROM RevisionSchedule WHERE topic_id = ? AND type = 'topic_review' AND status = 'pending'", [topicId]);
    if (enabled) {
      const dates = createTopicRevisionDates(new Date());
      dates.forEach((dueAt) => {
        db.run("INSERT INTO RevisionSchedule VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [id(), topicId, null, dueAt, null, "topic_review", "pending", null, now()]);
      });
      db.run("UPDATE Topic SET next_revision_at = ?, status = 'revising', updated_at = ? WHERE id = ?", [dates[0], now(), topicId]);
    } else {
      const nextStatus = topic.status === "revising" ? "learning" : topic.status;
      db.run("UPDATE Topic SET next_revision_at = NULL, status = ?, updated_at = ? WHERE id = ?", [nextStatus, now(), topicId]);
    }
  }, true);
}

export async function addCheatsheet(input: { topicId: string; sessionId?: string | null; title: string; filePath: string; fileType: string }) {
  return withDb((db) => {
    db.run("INSERT INTO Cheatsheet VALUES (?, ?, ?, ?, ?, ?, ?)", [id(), input.topicId, input.sessionId ?? null, input.title, input.filePath, input.fileType, now()]);
  }, true);
}

export async function updateCheatsheetTitle(cheatsheetId: string, title: string) {
  return withDb((db) => db.run("UPDATE Cheatsheet SET title = ? WHERE id = ?", [title.trim(), cheatsheetId]), true);
}

export async function deleteCheatsheet(cheatsheetId: string) {
  return withDb((db) => db.run("DELETE FROM Cheatsheet WHERE id = ?", [cheatsheetId]), true);
}

export async function importQuestionSet(data: QuestionImport, sessionId?: string | null) {
  return withDb((db) => {
    let category = one<Category>(db, "SELECT * FROM Category WHERE lower(name) = lower(?)", [data.category]);
    if (!category) {
      category = { id: id(), name: data.category, color: "#9CAF88", created_at: now(), updated_at: now() };
      db.run("INSERT INTO Category VALUES (?, ?, ?, ?, ?)", [category.id, category.name, category.color, category.created_at, category.updated_at]);
    }
    let topic = one<Topic>(db, "SELECT * FROM Topic WHERE lower(title) = lower(?) AND category_id = ?", [data.topic, category.id]);
    if (!topic) {
      const createdAt = now();
      topic = {
        id: id(),
        category_id: category.id,
        title: data.topic,
        description: null,
        status: "learning",
        mastery_score: 10,
        created_at: createdAt,
        updated_at: createdAt,
        last_studied_at: null,
        last_revised_at: null,
        next_revision_at: addDays(new Date(), 1).toISOString()
      };
      db.run(
        `INSERT INTO Topic VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [topic.id, topic.category_id, topic.title, topic.description, topic.status, topic.mastery_score, topic.created_at, topic.updated_at, null, null, topic.next_revision_at]
      );
    }
    const setId = id();
    db.run("INSERT INTO QuestionSet VALUES (?, ?, ?, ?, ?, ?, ?)", [setId, topic.id, sessionId ?? null, data.title, data.source, now(), JSON.stringify(data)]);
    data.questions.forEach((question) => {
      const isCode = question.type === "code";
      const answer = isCode ? (question.solution ?? "") : question.answer;
      const codeMeta = isCode ? JSON.stringify({ language: question.language ?? "python", framework: question.framework, starter_code: question.starter_code ?? "", test_cases: question.test_cases ?? [] }) : null;
      db.run("INSERT INTO Question VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        id(),
        setId,
        topic.id,
        question.question,
        answer,
        question.difficulty as Difficulty,
        JSON.stringify(question.tags),
        // New questions are immediately due so they show up to practice right
        // away; spaced-repetition intervals only kick in after the first rating.
        now(),
        null,
        0,
        0,
        now(),
        codeMeta
      ]);
    });
    return setId;
  }, true);
}

export async function importQuestionSetForTopic(data: QuestionImport, topicId: string, sessionId?: string | null) {
  return withDb((db) => {
    const topic = one<Topic>(db, "SELECT * FROM Topic WHERE id = ?", [topicId]);
    if (!topic) throw new Error("Choose a topic before importing questions.");
    const setId = id();
    db.run("INSERT INTO QuestionSet VALUES (?, ?, ?, ?, ?, ?, ?)", [setId, topicId, sessionId ?? null, data.title, data.source, now(), JSON.stringify(data)]);
    data.questions.forEach((question) => {
      const isCode = question.type === "code";
      const answer = isCode ? (question.solution ?? "") : question.answer;
      const codeMeta = isCode ? JSON.stringify({ language: question.language ?? "python", framework: question.framework, starter_code: question.starter_code ?? "", test_cases: question.test_cases ?? [] }) : null;
      db.run("INSERT INTO Question VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        id(),
        setId,
        topicId,
        question.question,
        answer,
        question.difficulty as Difficulty,
        JSON.stringify(question.tags),
        // New questions are immediately due so they show up to practice right
        // away; spaced-repetition intervals only kick in after the first rating.
        now(),
        null,
        0,
        0,
        now(),
        codeMeta
      ]);
    });
    db.run("UPDATE Topic SET updated_at = ? WHERE id = ?", [now(), topicId]);
    return setId;
  }, true);
}

/**
 * Re-skins an existing set's question/answer text (e.g. plain → Markdown+LaTeX)
 * WITHOUT touching review history. Questions are matched by position: the file's
 * questions array, in order, maps onto the set's existing rows ordered by rowid
 * (insertion order). Spaced-repetition fields (next_due_at, last_reviewed_at,
 * review_count, mastery_score) and every ReviewAttempt are left untouched because
 * the rows keep their original ids. The counts must match exactly.
 */
export async function updateQuestionSetText(setId: string, data: QuestionImport) {
  return withDb((db) => {
    const set = one<QuestionSet>(db, "SELECT * FROM QuestionSet WHERE id = ?", [setId]);
    if (!set) throw new Error("That question set no longer exists.");
    const existing = toRows<Question>(db, "SELECT * FROM Question WHERE question_set_id = ? ORDER BY rowid ASC", [setId]);
    if (existing.length !== data.questions.length) {
      throw new Error(
        `This file has ${data.questions.length} questions but the set has ${existing.length}. ` +
          "Counts must match (same questions, same order) to update in place and keep history."
      );
    }
    existing.forEach((question, index) => {
      const next = data.questions[index];
      db.run(
        "UPDATE Question SET question = ?, answer = ?, difficulty = ?, tags_json = ? WHERE id = ?",
        [next.question, next.answer, next.difficulty as Difficulty, JSON.stringify(next.tags), question.id]
      );
    });
    db.run("UPDATE QuestionSet SET title = ?, source = ?, raw_json = ? WHERE id = ?", [data.title, data.source, JSON.stringify(data), setId]);
    return existing.length;
  }, true);
}

export type QuestionSetTextDiff = {
  total: number;
  changed: number;
  items: Array<{
    index: number;
    questionChanged: boolean;
    answerChanged: boolean;
    oldQuestion: string;
    newQuestion: string;
    oldAnswer: string;
    newAnswer: string;
  }>;
};

/**
 * Read-only dry run of {@link updateQuestionSetText}. Returns the old→new text
 * pairs using the exact same matching (rowid order) the update uses, so a
 * preview can never disagree with what actually gets written.
 */
export async function previewQuestionSetText(setId: string, data: QuestionImport): Promise<QuestionSetTextDiff> {
  return withDb((db) => {
    const set = one<QuestionSet>(db, "SELECT * FROM QuestionSet WHERE id = ?", [setId]);
    if (!set) throw new Error("That question set no longer exists.");
    const existing = toRows<Question>(db, "SELECT * FROM Question WHERE question_set_id = ? ORDER BY rowid ASC", [setId]);
    if (existing.length !== data.questions.length) {
      throw new Error(
        `This file has ${data.questions.length} questions but the set has ${existing.length}. ` +
          "Counts must match (same questions, same order) to update in place and keep history."
      );
    }
    const items = existing.map((question, index) => {
      const next = data.questions[index];
      return {
        index,
        questionChanged: question.question !== next.question,
        answerChanged: question.answer !== next.answer,
        oldQuestion: question.question,
        newQuestion: next.question,
        oldAnswer: question.answer,
        newAnswer: next.answer
      };
    });
    return { total: existing.length, changed: items.filter((it) => it.questionChanged || it.answerChanged).length, items };
  });
}

/** All practice attempts for a topic's questions, oldest first. Read-only; lazy-loaded by the topic detail page. */
export async function getTopicAttempts(topicId: string): Promise<ReviewAttempt[]> {
  return withDb((db) =>
    toRows<ReviewAttempt>(
      db,
      `SELECT ReviewAttempt.*
       FROM ReviewAttempt JOIN Question ON Question.id = ReviewAttempt.question_id
       WHERE Question.topic_id = ?
       ORDER BY ReviewAttempt.reviewed_at ASC`,
      [topicId]
    )
  );
}

// A note is locked once any review attempt for its question lands at/after the
// note's creation time — i.e. the moment you rate that encounter, it becomes
// frozen history. Drafts written before rating (no such attempt yet) stay open.
export async function getQuestionNotes(questionId: string): Promise<QuestionNoteWithLock[]> {
  return withDb((db) =>
    toRows<QuestionNote & { locked: number }>(
      db,
      `SELECT n.*, EXISTS(
         SELECT 1 FROM ReviewAttempt a
         WHERE a.question_id = n.question_id AND a.reviewed_at >= n.created_at
       ) AS locked
       FROM QuestionNote n
       WHERE n.question_id = ?
       ORDER BY n.created_at DESC`,
      [questionId]
    ).map(({ locked, ...note }) => ({ ...note, editable: locked === 0 }))
  );
}

export async function addQuestionNote(input: { questionId: string; body: string; rating?: ReviewRating | null }): Promise<QuestionNoteWithLock | null> {
  return withDb((db) => {
    const body = input.body.trim();
    if (!body) return null;
    const ts = now();
    const noteId = id();
    db.run("INSERT INTO QuestionNote VALUES (?, ?, ?, ?, ?, ?)", [noteId, input.questionId, body, input.rating ?? null, ts, ts]);
    return { id: noteId, question_id: input.questionId, body, rating: input.rating ?? null, created_at: ts, updated_at: ts, editable: true };
  }, true);
}

/** True once the note has sealed (its question was reviewed at/after it was written). */
function noteIsLocked(db: Database, note: QuestionNote): boolean {
  const row = one<{ locked: number }>(
    db,
    "SELECT EXISTS(SELECT 1 FROM ReviewAttempt WHERE question_id = ? AND reviewed_at >= ?) AS locked",
    [note.question_id, note.created_at]
  );
  return Boolean(row?.locked);
}

export async function updateQuestionNote(noteId: string, body: string): Promise<{ ok: boolean }> {
  return withDb((db) => {
    const note = one<QuestionNote>(db, "SELECT * FROM QuestionNote WHERE id = ?", [noteId]);
    const trimmed = body.trim();
    if (!note || !trimmed || noteIsLocked(db, note)) return { ok: false };
    db.run("UPDATE QuestionNote SET body = ?, updated_at = ? WHERE id = ?", [trimmed, now(), noteId]);
    return { ok: true };
  }, true);
}

export async function deleteQuestionNote(noteId: string): Promise<{ ok: boolean }> {
  return withDb((db) => {
    const note = one<QuestionNote>(db, "SELECT * FROM QuestionNote WHERE id = ?", [noteId]);
    if (!note || noteIsLocked(db, note)) return { ok: false };
    db.run("DELETE FROM QuestionNote WHERE id = ?", [noteId]);
    return { ok: true };
  }, true);
}

export async function recordReview(input: { question: Question; rating: ReviewRating; userAnswer: string; seconds: number }) {
  return withDb((db) => {
    // Success streak = consecutive past reviews without a "forgot" (newest first,
    // stop at the first lapse). Drives interval growth instead of raw review count.
    const pastRatings = toRows<{ rating: ReviewRating }>(
      db,
      "SELECT rating FROM ReviewAttempt WHERE question_id = ? ORDER BY rowid DESC",
      [input.question.id]
    );
    let successStreak = 0;
    for (const past of pastRatings) {
      if (past.rating === "forgot") break;
      successStreak += 1;
    }
    const result = calculateQuestionReview({
      rating: input.rating,
      currentMastery: input.question.mastery_score,
      successStreak,
      targetDate: getActiveExamDate(),
      reviewedAt: new Date()
    });
    db.run("INSERT INTO ReviewAttempt VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id(),
      input.question.id,
      now(),
      input.rating,
      input.userAnswer,
      input.rating === "good" || input.rating === "easy" ? 1 : 0,
      Math.min(Math.max(0, Math.round(input.seconds)), PRACTICE_CARD_CAP_SECONDS)
    ]);
    db.run(
      `UPDATE Question
       SET next_due_at = ?, last_reviewed_at = ?, review_count = review_count + 1, mastery_score = ?
       WHERE id = ?`,
      [result.nextDueAt, now(), result.masteryScore, input.question.id]
    );
    const topicQuestions = toRows<Question>(db, "SELECT * FROM Question WHERE topic_id = ?", [input.question.topic_id]);
    const average = Math.round(topicQuestions.reduce((sum, question) => sum + (question.id === input.question.id ? result.masteryScore : question.mastery_score), 0) / topicQuestions.length);
    db.run("UPDATE Topic SET mastery_score = ?, updated_at = ? WHERE id = ?", [average, now(), input.question.topic_id]);
  }, true);
}

export type ExportedQuestion = {
  id: string;
  question: string;
  answer: string;
  difficulty: Difficulty;
  tags: string[];
  topic_id: string;
  topic_title: string;
  next_due_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  mastery_score: number;
};

/** Snapshot of the question bank for the phone practice app (questions-out hop). */
export async function exportPracticeQuestions(): Promise<ExportedQuestion[]> {
  return withDb((db) => {
    const rows = toRows<Question & { topic_title: string }>(
      db,
      `SELECT Question.*, Topic.title AS topic_title
       FROM Question JOIN Topic ON Topic.id = Question.topic_id
       ORDER BY Question.rowid ASC`
    );
    return rows.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      difficulty: q.difficulty,
      tags: JSON.parse(q.tags_json) as string[],
      topic_id: q.topic_id,
      topic_title: q.topic_title,
      next_due_at: q.next_due_at,
      last_reviewed_at: q.last_reviewed_at,
      review_count: q.review_count,
      mastery_score: q.mastery_score
    }));
  });
}

export type ExportedTopicReview = { id: string; topic_id: string; due_at: string };

/**
 * Topic reviews that are pending and already due (topic-level recall nudges). The
 * phone app can't infer these from per-question due dates — a review pulls in cards
 * whose own next_due_at is still in the future — so we ship the due topic ids and let
 * the phone rebuild each recall set locally with buildTopicReviewSet.
 *
 * "Due" means the calendar day, not the exact instant: a review's due_at carries the
 * time-of-day of the study session that scheduled it, so one due at 9pm today is
 * already "due today" on the desktop (isToday) from the morning on. Comparing against
 * end-of-today rather than now() keeps the export in step — otherwise reviews due later
 * today show on desktop but never reach the phone.
 */
export async function exportDueTopicReviews(): Promise<ExportedTopicReview[]> {
  return withDb((db) =>
    toRows<ExportedTopicReview>(
      db,
      `SELECT id, topic_id, due_at FROM RevisionSchedule
       WHERE type = 'topic_review' AND status = 'pending' AND due_at <= ?
       ORDER BY due_at ASC`,
      [endOfDay(new Date()).toISOString()]
    )
  );
}

const VALID_RATINGS = new Set<ReviewRating>(["forgot", "hard", "good", "easy"]);

// Recompute a question's progress by replaying its full attempt history (chronological),
// using the streak engine WITHOUT exam clamp — the stored schedule stays pure-adaptive and
// exam mode is applied dynamically at due-selection time.
function recomputeQuestionFromHistory(db: Database, questionId: string) {
  const attempts = toRows<{ rating: ReviewRating; reviewed_at: string }>(
    db,
    "SELECT rating, reviewed_at FROM ReviewAttempt WHERE question_id = ? ORDER BY reviewed_at ASC, rowid ASC",
    [questionId]
  );
  let mastery = 0;
  let streak = 0;
  let count = 0;
  let lastReviewed: string | null = null;
  let nextDue: string | null = null;
  for (const attempt of attempts) {
    const result = calculateQuestionReview({
      rating: attempt.rating,
      currentMastery: mastery,
      successStreak: streak,
      reviewedAt: parseISO(attempt.reviewed_at)
    });
    mastery = result.masteryScore;
    nextDue = result.nextDueAt;
    lastReviewed = attempt.reviewed_at;
    count += 1;
    streak = attempt.rating === "forgot" ? 0 : streak + 1;
  }
  if (count > 0 && nextDue) {
    db.run("UPDATE Question SET review_count = ?, mastery_score = ?, last_reviewed_at = ?, next_due_at = ? WHERE id = ?", [count, mastery, lastReviewed, nextDue, questionId]);
  }
}

/**
 * Merge practice attempts from the phone (attempts-in hop). Non-destructive:
 * new attempts are unioned by id (existing/unknown-question/invalid ones skipped),
 * then each touched question — and its topic's mastery — is recomputed from the merged
 * history. `completedTopicReviewIds` are the topic-review nudges the phone finished;
 * each still-pending one is closed here so it stops showing as due on the desktop.
 * Safe to run repeatedly; attempt ids dedupe and reviews only close while pending, so
 * nothing is double-counted.
 */
export async function mergePracticeAttempts(
  attempts: ReviewAttempt[],
  completedTopicReviewIds: string[] = []
): Promise<{ merged: number; skipped: number; questions: number; reviews: number }> {
  return withDb((db) => {
    const existingIds = new Set(toRows<{ id: string }>(db, "SELECT id FROM ReviewAttempt").map((r) => r.id));
    const validQuestions = new Set(toRows<{ id: string }>(db, "SELECT id FROM Question").map((r) => r.id));
    const touched = new Set<string>();
    // The attempts actually inserted this run, kept so a completed topic review can be
    // logged with a rating drawn only from this batch (not re-counting old duplicates).
    const mergedAttempts: { question_id: string; rating: ReviewRating }[] = [];
    let merged = 0;
    let skipped = 0;

    for (const attempt of attempts) {
      if (
        !attempt ||
        typeof attempt.id !== "string" ||
        typeof attempt.question_id !== "string" ||
        typeof attempt.reviewed_at !== "string" ||
        !VALID_RATINGS.has(attempt.rating) ||
        existingIds.has(attempt.id) ||
        !validQuestions.has(attempt.question_id)
      ) {
        skipped += 1;
        continue;
      }
      db.run("INSERT INTO ReviewAttempt VALUES (?, ?, ?, ?, ?, ?, ?)", [
        attempt.id,
        attempt.question_id,
        attempt.reviewed_at,
        attempt.rating,
        attempt.user_answer ?? null,
        attempt.was_correct ? 1 : 0,
        typeof attempt.time_spent_seconds === "number" ? attempt.time_spent_seconds : 0
      ]);
      existingIds.add(attempt.id);
      touched.add(attempt.question_id);
      mergedAttempts.push({ question_id: attempt.question_id, rating: attempt.rating });
      merged += 1;
    }

    const topics = new Set<string>();
    for (const questionId of touched) {
      recomputeQuestionFromHistory(db, questionId);
      const owner = one<{ topic_id: string }>(db, "SELECT topic_id FROM Question WHERE id = ?", [questionId]);
      if (owner) topics.add(owner.topic_id);
    }
    for (const topicId of topics) {
      const scores = toRows<{ mastery_score: number }>(db, "SELECT mastery_score FROM Question WHERE topic_id = ?", [topicId]);
      if (scores.length) {
        const avg = Math.round(scores.reduce((sum, s) => sum + s.mastery_score, 0) / scores.length);
        db.run("UPDATE Topic SET mastery_score = ?, updated_at = ? WHERE id = ?", [avg, now(), topicId]);
      }
    }

    // Collect the ratings each completed review should be logged with, drawn from this
    // batch's attempts on that topic (falls back to "good" if none came through).
    const newRatingsByTopic = new Map<string, ReviewRating[]>();
    for (const attempt of mergedAttempts) {
      const owner = one<{ topic_id: string }>(db, "SELECT topic_id FROM Question WHERE id = ?", [attempt.question_id]);
      if (!owner) continue;
      const bucket = newRatingsByTopic.get(owner.topic_id) ?? [];
      bucket.push(attempt.rating);
      newRatingsByTopic.set(owner.topic_id, bucket);
    }

    let reviews = 0;
    for (const reviewId of completedTopicReviewIds) {
      if (typeof reviewId !== "string") continue;
      const revision = one<RevisionSchedule>(
        db,
        "SELECT * FROM RevisionSchedule WHERE id = ? AND type = 'topic_review' AND status = 'pending'",
        [reviewId]
      );
      if (!revision) continue;
      const rating = aggregateReviewRating(newRatingsByTopic.get(revision.topic_id) ?? []);
      const completedAt = now();
      db.run("UPDATE RevisionSchedule SET status = 'completed', completed_at = ?, rating = ? WHERE id = ?", [completedAt, rating, reviewId]);
      db.run("UPDATE Topic SET last_revised_at = ?, updated_at = ? WHERE id = ?", [completedAt, completedAt, revision.topic_id]);
      const next = one<RevisionSchedule>(db, "SELECT * FROM RevisionSchedule WHERE topic_id = ? AND status = 'pending' ORDER BY due_at LIMIT 1", [revision.topic_id]);
      db.run("UPDATE Topic SET next_revision_at = ? WHERE id = ?", [next?.due_at ?? null, revision.topic_id]);
      reviews += 1;
    }

    return { merged, skipped, questions: touched.size, reviews };
  }, true);
}

export async function completeRevision(revisionId: string, rating: ReviewRating) {
  return withDb((db) => {
    const completedAt = now();
    const revision = one<RevisionSchedule>(db, "SELECT * FROM RevisionSchedule WHERE id = ?", [revisionId]);
    db.run("UPDATE RevisionSchedule SET status = 'completed', completed_at = ?, rating = ? WHERE id = ?", [completedAt, rating, revisionId]);
    if (revision) {
      db.run("UPDATE Topic SET last_revised_at = ?, updated_at = ? WHERE id = ?", [completedAt, now(), revision.topic_id]);
      const next = one<RevisionSchedule>(db, "SELECT * FROM RevisionSchedule WHERE topic_id = ? AND status = 'pending' ORDER BY due_at LIMIT 1", [revision.topic_id]);
      db.run("UPDATE Topic SET next_revision_at = ? WHERE id = ?", [next?.due_at ?? null, revision.topic_id]);
    }
  }, true);
}

/** Toggle a question's bookmark. Returns the new state (true = now bookmarked). */
export async function toggleBookmark(questionId: string): Promise<boolean> {
  return withDb((db) => {
    const existing = one<{ question_id: string }>(db, "SELECT question_id FROM Bookmark WHERE question_id = ?", [questionId]);
    if (existing) {
      db.run("DELETE FROM Bookmark WHERE question_id = ?", [questionId]);
      return false;
    }
    db.run("INSERT INTO Bookmark VALUES (?, ?)", [questionId, now()]);
    return true;
  }, true);
}

export type QuestionFields = { question: string; answer: string; difficulty: Difficulty; tags: string[] };

/** Add a single question to an existing set (topic is inherited from the set). New questions are immediately due. */
export async function addQuestion(setId: string, fields: QuestionFields): Promise<string> {
  return withDb((db) => {
    const set = one<QuestionSet>(db, "SELECT * FROM QuestionSet WHERE id = ?", [setId]);
    if (!set) throw new Error("Choose a set for the question.");
    const questionId = id();
    db.run("INSERT INTO Question VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      questionId,
      setId,
      set.topic_id,
      fields.question,
      fields.answer,
      fields.difficulty,
      JSON.stringify(fields.tags),
      now(),
      null,
      0,
      0,
      now(),
      null
    ]);
    return questionId;
  }, true);
}

/** Edit a question's text/difficulty/tags in place — review history (id, attempts, mastery) is preserved. */
export async function updateQuestion(questionId: string, fields: QuestionFields) {
  return withDb((db) => {
    db.run("UPDATE Question SET question = ?, answer = ?, difficulty = ?, tags_json = ? WHERE id = ?", [
      fields.question,
      fields.answer,
      fields.difficulty,
      JSON.stringify(fields.tags),
      questionId
    ]);
  }, true);
}

export async function deleteQuestion(questionId: string) {
  return withDb((db) => {
    db.run("DELETE FROM Bookmark WHERE question_id = ?", [questionId]);
    db.run("DELETE FROM Question WHERE id = ?", [questionId]);
  }, true);
}

export async function deleteQuestionSet(questionSetId: string) {
  return withDb((db) => {
    db.run("DELETE FROM Bookmark WHERE question_id IN (SELECT id FROM Question WHERE question_set_id = ?)", [questionSetId]);
    db.run("DELETE FROM ReviewAttempt WHERE question_id IN (SELECT id FROM Question WHERE question_set_id = ?)", [questionSetId]);
    db.run("DELETE FROM Question WHERE question_set_id = ?", [questionSetId]);
    db.run("DELETE FROM QuestionSet WHERE id = ?", [questionSetId]);
  }, true);
}

export async function deleteSession(sessionId: string) {
  return withDb((db) => {
    db.run("DELETE FROM PomodoroBlock WHERE session_id = ?", [sessionId]);
    db.run("UPDATE Cheatsheet SET session_id = NULL WHERE session_id = ?", [sessionId]);
    db.run("UPDATE QuestionSet SET session_id = NULL WHERE session_id = ?", [sessionId]);
    db.run("DELETE FROM RevisionSchedule WHERE session_id = ?", [sessionId]);
    db.run("DELETE FROM ResourceLink WHERE session_id = ?", [sessionId]);
    db.run("DELETE FROM StudySession WHERE id = ?", [sessionId]);
  }, true);
}

export async function deleteTopic(topicId: string) {
  return withDb((db) => {
    db.run("DELETE FROM Bookmark WHERE question_id IN (SELECT id FROM Question WHERE topic_id = ?)", [topicId]);
    db.run("DELETE FROM ReviewAttempt WHERE question_id IN (SELECT id FROM Question WHERE topic_id = ?)", [topicId]);
    db.run("DELETE FROM Question WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM QuestionSet WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM Cheatsheet WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM RevisionSchedule WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM ResourceLink WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM TopicJournal WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM PomodoroBlock WHERE session_id IN (SELECT id FROM StudySession WHERE topic_id = ?)", [topicId]);
    db.run("DELETE FROM StudySession WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM Topic WHERE id = ?", [topicId]);
  }, true);
}

export async function getTopicJournal(topicId: string): Promise<TopicJournalEntry[]> {
  return withDb((db) =>
    toRows<TopicJournalEntry>(
      db,
      `SELECT tj.*, SUBSTR(q.question, 1, 120) AS question_preview
       FROM TopicJournal tj
       LEFT JOIN Question q ON q.id = tj.question_id
       WHERE tj.topic_id = ?
       ORDER BY tj.created_at DESC`,
      [topicId]
    )
  );
}

export async function addTopicJournalEntry(input: { topicId: string; body: string; questionId?: string | null }): Promise<TopicJournalEntry | null> {
  return withDb((db) => {
    const body = input.body.trim();
    if (!body) return null;
    const ts = now();
    const entryId = id();
    db.run("INSERT INTO TopicJournal VALUES (?, ?, ?, ?, ?, ?)", [entryId, input.topicId, body, input.questionId ?? null, ts, ts]);
    return { id: entryId, topic_id: input.topicId, body, question_id: input.questionId ?? null, question_preview: null, created_at: ts, updated_at: ts };
  }, true);
}

export async function updateTopicJournalEntry(entryId: string, body: string): Promise<void> {
  return withDb((db) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    db.run("UPDATE TopicJournal SET body = ?, updated_at = ? WHERE id = ?", [trimmed, now(), entryId]);
  }, true);
}

export async function deleteTopicJournalEntry(entryId: string): Promise<void> {
  return withDb((db) => { db.run("DELETE FROM TopicJournal WHERE id = ?", [entryId]); }, true);
}
