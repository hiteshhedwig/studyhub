export const schemaSql = `
CREATE TABLE IF NOT EXISTS Category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Topic (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK(status IN ('learning', 'revising', 'strong', 'mastered')),
  mastery_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_studied_at TEXT,
  last_revised_at TEXT,
  next_revision_at TEXT,
  FOREIGN KEY(category_id) REFERENCES Category(id)
);

CREATE TABLE IF NOT EXISTS StudySession (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  focus_minutes INTEGER NOT NULL,
  break_minutes INTEGER NOT NULL,
  pomodoros_completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  reflection TEXT,
  understanding_rating INTEGER,
  difficulty_rating INTEGER,
  chatgpt_link TEXT,
  created_at TEXT NOT NULL,
  extra_focus_seconds INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(topic_id) REFERENCES Topic(id)
);

CREATE TABLE IF NOT EXISTS PomodoroBlock (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  work_minutes INTEGER NOT NULL,
  break_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES StudySession(id)
);

CREATE TABLE IF NOT EXISTS Cheatsheet (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES Topic(id),
  FOREIGN KEY(session_id) REFERENCES StudySession(id)
);

CREATE TABLE IF NOT EXISTS QuestionSet (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES Topic(id),
  FOREIGN KEY(session_id) REFERENCES StudySession(id)
);

CREATE TABLE IF NOT EXISTS Question (
  id TEXT PRIMARY KEY,
  question_set_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
  tags_json TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  mastery_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  code_meta_json TEXT,
  FOREIGN KEY(question_set_id) REFERENCES QuestionSet(id),
  FOREIGN KEY(topic_id) REFERENCES Topic(id)
);

CREATE TABLE IF NOT EXISTS ReviewAttempt (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  rating TEXT NOT NULL CHECK(rating IN ('forgot', 'hard', 'good', 'easy')),
  user_answer TEXT,
  was_correct INTEGER NOT NULL,
  time_spent_seconds INTEGER NOT NULL,
  FOREIGN KEY(question_id) REFERENCES Question(id)
);

CREATE TABLE IF NOT EXISTS Bookmark (
  question_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  FOREIGN KEY(question_id) REFERENCES Question(id)
);

CREATE TABLE IF NOT EXISTS QuestionNote (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  body TEXT NOT NULL,
  rating TEXT CHECK(rating IN ('forgot', 'hard', 'good', 'easy') OR rating IS NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(question_id) REFERENCES Question(id)
);

CREATE TABLE IF NOT EXISTS Note (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT 'n1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS RevisionSchedule (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  session_id TEXT,
  due_at TEXT NOT NULL,
  completed_at TEXT,
  type TEXT NOT NULL CHECK(type IN ('topic_review', 'cheatsheet_review', 'question_practice')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'missed', 'rescheduled')),
  rating TEXT CHECK(rating IN ('forgot', 'hard', 'good', 'easy') OR rating IS NULL),
  created_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES Topic(id),
  FOREIGN KEY(session_id) REFERENCES StudySession(id)
);

CREATE TABLE IF NOT EXISTS ResourceLink (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  session_id TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('chatgpt', 'article', 'video', 'docs', 'other')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES Topic(id),
  FOREIGN KEY(session_id) REFERENCES StudySession(id)
);

CREATE TABLE IF NOT EXISTS Settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS TopicJournal (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  body TEXT NOT NULL,
  question_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES Topic(id),
  FOREIGN KEY(question_id) REFERENCES Question(id)
);
`;

export const seedSql = `
INSERT OR IGNORE INTO Category (id, name, color, created_at, updated_at)
VALUES ('cat-default', 'Personal Study', '#C9A66B', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO Settings (key, value)
VALUES
  ('theme', '"warm-dark"'),
  ('defaultPomodoro', '{"focus":25,"break":5}'),
  ('revisionIntervals', '[1,3,7,14,30,60]');
`;
