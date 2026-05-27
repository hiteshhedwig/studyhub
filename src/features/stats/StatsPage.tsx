import { useMemo } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { StudyTimeChart } from "../../components/charts/StudyTimeChart";
import { useAppStore } from "../../store/appStore";
import { dailyStudySeries, rankedTopics, recallAccuracy, revisionCompletionRate } from "../../services/statsService";

export function StatsPage() {
  const { sessions, revisions, questions, topics } = useAppStore();
  const series = dailyStudySeries(sessions, 14);
  const totalMinutes = sessions.reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);
  const pomodoros = sessions.reduce((sum, session) => sum + session.pomodoros_completed, 0);
  const answered = questions.reduce((sum, question) => sum + question.review_count, 0);
  const missed = revisions.filter((revision) => revision.status === "missed").length;
  const weak = rankedTopics(topics, "weak");
  const strong = rankedTopics(topics, "strong");

  const timeByTopic = useMemo(() => {
    return topics
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        minutes: sessions
          .filter((session) => session.topic_id === topic.id)
          .reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0)
      }))
      .filter((entry) => entry.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [topics, sessions]);

  return (
    <>
      <PageHeader title="Stats" eyebrow="Study signals without noise or achievement theater." />
      <section className="grid three">
        <div className="card stat"><span className="muted">Total focus</span><strong>{totalMinutes}m</strong></div>
        <div className="card stat"><span className="muted">Pomodoros</span><strong>{pomodoros}</strong></div>
        <div className="card stat"><span className="muted">Recall accuracy</span><strong>{recallAccuracy(questions)}%</strong></div>
        <div className="card stat"><span className="muted">Revision completion</span><strong>{revisionCompletionRate(revisions)}%</strong></div>
        <div className="card stat"><span className="muted">Questions answered</span><strong>{answered}</strong></div>
        <div className="card stat"><span className="muted">Missed revisions</span><strong>{missed}</strong></div>
      </section>

      {/* Chart sits on its own row so it isn't fighting list cards for height. */}
      <section style={{ marginTop: 20 }}>
        <div className="card" style={{ minHeight: 320 }}>
          <h2>Daily study time</h2>
          {series.some((item) => item.minutes) ? <StudyTimeChart data={series} /> : <EmptyState>Charts will fill in after completed Pomodoros.</EmptyState>}
        </div>
      </section>

      <section className="grid three" style={{ marginTop: 20, alignItems: "stretch" }}>
        <div className="card"><h2>Weakest topics</h2><TopicList items={weak} /></div>
        <div className="card"><h2>Strongest topics</h2><TopicList items={strong} /></div>
        <div className="card">
          <h2>Time by topic</h2>
          {timeByTopic.length ? (
            <div className="list">
              {timeByTopic.slice(0, 10).map((entry) => (
                <div className="list-item" key={entry.id}>
                  <div className="split">
                    <span className="truncate" title={entry.title}>{entry.title}</span>
                    <span>{entry.minutes}m</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No focused time recorded yet.</EmptyState>}
        </div>
      </section>
    </>
  );
}

function TopicList({ items }: { items: { id: string; title: string; mastery_score: number }[] }) {
  return items.length ? (
    <div className="list">
      {items.map((topic) => (
        <div className="list-item" key={topic.id}>
          <div className="split">
            <span className="truncate" title={topic.title}>{topic.title}</span>
            <span className="pill">{topic.mastery_score}%</span>
          </div>
        </div>
      ))}
    </div>
  ) : <EmptyState>No topics yet.</EmptyState>;
}
