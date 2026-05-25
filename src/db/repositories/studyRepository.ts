import type { Database } from "sql.js";
import { addDays } from "date-fns";
import { getDatabase, one, persistDatabase, toRows } from "../database";
import { calculateQuestionReview, createTopicRevisionDates } from "../../services/spacedRepetition";
import type { Category, Cheatsheet, Difficulty, Question, QuestionSet, ResourceLink, ReviewRating, RevisionSchedule, StudySession, Topic } from "./types";
import type { QuestionImport } from "../../services/importQuestions";

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export type DashboardData = {
  categories: Category[];
  topics: Topic[];
  sessions: StudySession[];
  cheatsheets: Cheatsheet[];
  questionSets: QuestionSet[];
  questions: Question[];
  revisions: RevisionSchedule[];
  links: ResourceLink[];
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
      `SELECT Question.*, Topic.title AS topic_title
       FROM Question JOIN Topic ON Topic.id = Question.topic_id
       ORDER BY next_due_at ASC`
    ),
    revisions: toRows<RevisionSchedule>(
      db,
      `SELECT RevisionSchedule.*, Topic.title AS topic_title
       FROM RevisionSchedule JOIN Topic ON Topic.id = RevisionSchedule.topic_id
       ORDER BY due_at ASC`
    ),
    links: toRows<ResourceLink>(db, "SELECT * FROM ResourceLink ORDER BY created_at DESC")
  }));
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
      created_at: now()
    };
    db.run(
      `INSERT INTO StudySession VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        session.created_at
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
}) {
  return withDb((db) => {
    const endedAt = now();
    db.run(
      `UPDATE StudySession
       SET ended_at = ?, reflection = ?, understanding_rating = ?, difficulty_rating = ?, chatgpt_link = ?
       WHERE id = ?`,
      [endedAt, input.reflection, input.understanding, input.difficulty, input.chatgptLink ?? null, input.sessionId]
    );
    const session = one<StudySession>(db, "SELECT * FROM StudySession WHERE id = ?", [input.sessionId]);
    if (!session) return;
    if (input.chatgptLink) {
      db.run("INSERT INTO ResourceLink VALUES (?, ?, ?, ?, ?, ?, ?)", [id(), session.topic_id, session.id, "ChatGPT conversation", input.chatgptLink, "chatgpt", now()]);
    }
    if (input.scheduleRevisions) {
      const dates = createTopicRevisionDates(new Date(endedAt));
      dates.forEach((dueAt) => {
        db.run("INSERT INTO RevisionSchedule VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [id(), session.topic_id, session.id, dueAt, null, "topic_review", "pending", null, now()]);
      });
      db.run("UPDATE Topic SET next_revision_at = ?, status = 'revising', updated_at = ? WHERE id = ?", [dates[0], now(), session.topic_id]);
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
      db.run("INSERT INTO Question VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        id(),
        setId,
        topic.id,
        question.question,
        question.answer,
        question.difficulty as Difficulty,
        JSON.stringify(question.tags),
        addDays(new Date(), question.difficulty === "hard" ? 1 : question.difficulty === "medium" ? 3 : 7).toISOString(),
        null,
        0,
        0,
        now()
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
      db.run("INSERT INTO Question VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        id(),
        setId,
        topicId,
        question.question,
        question.answer,
        question.difficulty as Difficulty,
        JSON.stringify(question.tags),
        addDays(new Date(), question.difficulty === "hard" ? 1 : question.difficulty === "medium" ? 3 : 7).toISOString(),
        null,
        0,
        0,
        now()
      ]);
    });
    db.run("UPDATE Topic SET updated_at = ? WHERE id = ?", [now(), topicId]);
    return setId;
  }, true);
}

export async function recordReview(input: { question: Question; rating: ReviewRating; userAnswer: string; seconds: number }) {
  return withDb((db) => {
    const result = calculateQuestionReview({
      rating: input.rating,
      currentMastery: input.question.mastery_score,
      reviewCount: input.question.review_count,
      reviewedAt: new Date()
    });
    db.run("INSERT INTO ReviewAttempt VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id(),
      input.question.id,
      now(),
      input.rating,
      input.userAnswer,
      input.rating === "good" || input.rating === "easy" ? 1 : 0,
      input.seconds
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

export async function deleteQuestion(questionId: string) {
  return withDb((db) => db.run("DELETE FROM Question WHERE id = ?", [questionId]), true);
}

export async function deleteQuestionSet(questionSetId: string) {
  return withDb((db) => {
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
    db.run("DELETE FROM ReviewAttempt WHERE question_id IN (SELECT id FROM Question WHERE topic_id = ?)", [topicId]);
    db.run("DELETE FROM Question WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM QuestionSet WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM Cheatsheet WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM RevisionSchedule WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM ResourceLink WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM PomodoroBlock WHERE session_id IN (SELECT id FROM StudySession WHERE topic_id = ?)", [topicId]);
    db.run("DELETE FROM StudySession WHERE topic_id = ?", [topicId]);
    db.run("DELETE FROM Topic WHERE id = ?", [topicId]);
  }, true);
}
