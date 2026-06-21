import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, Feather, FileText, LayoutGrid, Minus, MessageSquare, Network, Pencil, Quote, Trash2, Video } from "lucide-react";
import { sessionFocusMinutes, topicHasLateRevision, topicPracticeStats, topicTrend, type Trend } from "../../services/statsService";
import { format as formatDate, formatDistanceToNow, isThisWeek, isToday, isYesterday, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { QuestionScoreHeatmap } from "../../components/charts/QuestionScoreHeatmap";
import { useAppStore } from "../../store/appStore";
import { confirmDialog, toast } from "../../store/uiStore";
import { openLocalPath } from "../../services/fileStorage";
import { addTopicJournalEntry, deleteTopicJournalEntry, getTopicJournal, updateTopicJournalEntry } from "../../db/repositories/studyRepository";
import { RevisionHistoryTimeline, summarizeRevisions } from "../../components/ui/RevisionHistoryTimeline";
import type { ReviewAttempt, Topic, TopicJournalEntry } from "../../db/repositories/types";
import { formatMinutes } from "../../utils/formatTime";

function TrendArrow({ trend }: { trend: Trend }) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const label = trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Holding";
  return (
    <span className={`trend trend-${trend}`} title={label} aria-label={label}>
      <Icon size={14} />
    </span>
  );
}

function TopicJournalSection({ topicId }: { topicId: string }) {
  const [entries, setEntries] = useState<TopicJournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let alive = true;
    void getTopicJournal(topicId).then((rows) => {
      if (alive) { setEntries(rows); setLoaded(true); }
    });
    return () => { alive = false; };
  }, [topicId]);

  // Group entries by calendar date (newest date first, entries within a day newest first)
  const grouped = useMemo(() => {
    const map = new Map<string, TopicJournalEntry[]>();
    for (const entry of entries) {
      const key = formatDate(parseISO(entry.created_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return [...map.entries()].map(([dateKey, dayEntries]) => ({ dateKey, dayEntries }));
  }, [entries]);

  function dateLabel(dateKey: string) {
    const d = parseISO(dateKey);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    if (isThisWeek(d, { weekStartsOn: 1 })) return formatDate(d, "EEEE");
    return formatDate(d, "MMMM d, yyyy");
  }

  async function addEntry() {
    const entry = await addTopicJournalEntry({ topicId, body: draft });
    if (entry) { setEntries((prev) => [entry, ...prev]); setDraft(""); }
  }

  async function saveEdit(entryId: string) {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    await updateTopicJournalEntry(entryId, trimmed);
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, body: trimmed, updated_at: new Date().toISOString() } : e));
    setEditingId(null);
  }

  async function removeEntry(entryId: string) {
    await deleteTopicJournalEntry(entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  return (
    <div className="card">
      <div className="tj-section-head">
        <Feather size={17} />
        <h2>Journal</h2>
        {entries.length > 0 ? <span className="tj-badge">{entries.length}</span> : null}
      </div>

      {/* New-entry zone — feels like opening a blank page */}
      <div className="tj-new-entry">
        <div className="tj-new-entry-header">
          <span className="tj-new-entry-label">New entry</span>
          <span className="tj-new-entry-date-label">{formatDate(new Date(), "MMMM d, yyyy")}</span>
        </div>
        <textarea
          className="tj-naked-area"
          placeholder="Capture a reflection, insight, or note about this topic…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void addEntry(); }
          }}
        />
        {draft.trim() ? (
          <div className="tj-new-entry-footer">
            <button className="btn primary small" type="button" onClick={() => void addEntry()}>Save entry</button>
            <button className="btn small ghost" type="button" onClick={() => setDraft("")}>Clear</button>
            <span className="muted" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>Cmd+Enter</span>
          </div>
        ) : null}
      </div>

      {/* Past entries grouped by date */}
      {loaded && entries.length === 0 ? (
        <p className="tj-empty">Your journal is empty — write your first entry above.</p>
      ) : (
        <div className="tj-journal-feed">
          {grouped.map(({ dateKey, dayEntries }) => (
            <div key={dateKey} className="tj-day-group">
              <div className="tj-day-divider"><span>{dateLabel(dateKey)}</span></div>
              {dayEntries.map((entry) => (
                <div key={entry.id} className="tj-journal-entry">
                  {editingId === entry.id ? (
                    <div className="tj-edit-form">
                      <textarea
                        className="textarea"
                        value={editingText}
                        autoFocus
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void saveEdit(entry.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="button-row">
                        <button className="btn small" type="button" onClick={() => void saveEdit(entry.id)}><Check size={14} /> Save</button>
                        <button className="btn small ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="tj-journal-body">{entry.body}</p>
                      <div className="tj-journal-meta">
                        <span className="tj-journal-time" title={formatDate(parseISO(entry.created_at), "MMM d, yyyy 'at' h:mm a")}>
                          {formatDate(parseISO(entry.created_at), "h:mm a")}
                          {entry.updated_at !== entry.created_at ? " · edited" : ""}
                        </span>
                        {entry.question_preview ? (
                          <span className="tj-q-chip" title={entry.question_preview}>
                            <Quote size={10} aria-hidden="true" /> {entry.question_preview}
                          </span>
                        ) : null}
                        <span className="tj-entry-actions">
                          <button className="tj-icon-btn" type="button" aria-label="Edit entry" onClick={() => { setEditingId(entry.id); setEditingText(entry.body); }}>
                            <Pencil size={13} />
                          </button>
                          <button className="tj-icon-btn danger" type="button" aria-label="Delete entry" onClick={() => void removeEntry(entry.id)}>
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ViewMode = "list" | "map";
type SortKey = "created" | "alpha" | "weak";
type TopicGroup = { catId: string; catName: string; catColor: string; topics: Topic[] };

type MapNodeBase = { id: string; r: number; label: string; type: "center" | "category" | "topic"; color: string; topicId: string | null };
type MapNode = MapNodeBase & SimulationNodeDatum;
type MapEdge = SimulationLinkDatum<MapNode> & { color: string; sourceId: string; targetId: string };
type Viewport = { x: number; y: number; k: number };

const W = 1000, H = 680;

function TopicMindMap({ grouped, navigate }: { grouped: TopicGroup[]; navigate: (to: string) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; vpX: number; vpY: number; moved: boolean } | null>(null);
  const runId = useRef(0);
  const cx = W / 2, cy = H / 2;

  // Seed nodes radially so d3 starts from a reasonable layout
  const { nodes, edges } = useMemo(() => {
    const nodes: MapNode[] = [];
    const edges: MapEdge[] = [];
    const N = grouped.length;

    nodes.push({ id: "__center__", r: 22, label: "Topics", type: "center", color: "var(--accent)", topicId: null, x: cx, y: cy, fx: cx, fy: cy });

    grouped.forEach(({ catId, catName, catColor, topics: catTopics }, i) => {
      const catAngle = N > 0 ? (i / N) * 2 * Math.PI - Math.PI / 2 : 0;
      const M = catTopics.length;
      const R_CAT = 140;
      const catX = cx + R_CAT * Math.cos(catAngle);
      const catY = cy + R_CAT * Math.sin(catAngle);
      const catNodeId = `cat-${catId}`;
      const color = catColor || "var(--accent)";

      nodes.push({ id: catNodeId, r: 13 + Math.min(M, 8), label: catName, type: "category", color, topicId: null, x: catX, y: catY });
      edges.push({ source: "__center__", target: catNodeId, color, sourceId: "__center__", targetId: catNodeId });

      catTopics.forEach((topic, j) => {
        const arc = M === 1 ? 0 : Math.min(Math.PI * 0.85, 0.4 + M * 0.18);
        const tAngle = catAngle + (M > 1 ? arc * (j / (M - 1) - 0.5) : 0);
        const R_TOPIC = 90;
        nodes.push({
          id: topic.id, r: 8 + topic.mastery_score / 20, label: topic.title,
          type: "topic", color, topicId: topic.id,
          x: catX + R_TOPIC * Math.cos(tAngle), y: catY + R_TOPIC * Math.sin(tAngle)
        });
        edges.push({ source: catNodeId, target: topic.id, color, sourceId: catNodeId, targetId: topic.id });
      });
    });

    return { nodes, edges };
  }, [grouped, cx, cy]);

  // Run simulation synchronously, then auto-fit the viewport to show all nodes
  useEffect(() => {
    if (nodes.length === 0) return;
    const id = ++runId.current;

    const simNodes = nodes.map(n => ({ ...n }));
    const nodeIndex = new Map(simNodes.map(n => [n.id, n]));
    const simEdges = edges.map(e => ({
      ...e,
      source: nodeIndex.get(e.sourceId)!,
      target: nodeIndex.get(e.targetId)!,
    }));

    forceSimulation<MapNode>(simNodes)
      .force("link", forceLink<MapNode, typeof simEdges[0]>(simEdges)
        .id(d => d.id)
        .distance(d => (d.target as MapNode).type === "category" ? 130 : 80)
        .strength(0.8)
      )
      .force("charge", forceManyBody<MapNode>().strength(d => {
        if (d.type === "center") return -400;
        if (d.type === "category") return -180;
        return -60;
      }))
      .force("center", forceCenter(cx, cy).strength(0.1))
      .force("collide", forceCollide<MapNode>(d => d.r + 16).strength(0.9))
      .stop()
      .tick(250);

    if (id !== runId.current) return;

    const pos = new Map(simNodes.map(n => [n.id, { x: n.x ?? cx, y: n.y ?? cy }]));
    setPositions(pos);

    // Auto-fit: compute graph bounding box and set viewport
    const pad = 60;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of simNodes) {
      const labelExtra = n.type === "topic" ? 70 : 90; // rough label width
      minX = Math.min(minX, (n.x ?? cx) - n.r - labelExtra);
      maxX = Math.max(maxX, (n.x ?? cx) + n.r + labelExtra);
      minY = Math.min(minY, (n.y ?? cy) - n.r - 20);
      maxY = Math.max(maxY, (n.y ?? cy) + n.r + 20);
    }
    const gW = maxX - minX || 1, gH = maxY - minY || 1;
    const k = Math.min((W - pad * 2) / gW, (H - pad * 2) / gH, 1.8);
    setVp({ k, x: pad - minX * k, y: pad - minY * k });
  }, [nodes, edges, cx, cy]);

  // Scroll to zoom (toward cursor)
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    const my = (e.clientY - rect.top) / rect.height * H;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setVp(prev => {
      const k = Math.max(0.2, Math.min(4, prev.k * factor));
      return { k, x: mx - (mx - prev.x) * (k / prev.k), y: my - (my - prev.y) * (k / prev.k) };
    });
  }

  // Drag to pan
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    dragRef.current = { sx: e.clientX, sy: e.clientY, vpX: vp.x, vpY: vp.y, moved: false };
  }
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
    if (!dragRef.current.moved && Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      // Capture values before setVp — the updater runs async and dragRef.current
      // may be null by then (onMouseUp fires between the check and the callback).
      const { vpX, vpY } = dragRef.current;
      setVp(prev => ({ ...prev, x: vpX + dx, y: vpY + dy }));
    }
  }
  function onMouseUp() { dragRef.current = null; }

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.sourceId)) m.set(e.sourceId, new Set());
      if (!m.has(e.targetId)) m.set(e.targetId, new Set());
      m.get(e.sourceId)!.add(e.targetId);
      m.get(e.targetId)!.add(e.sourceId);
    }
    return m;
  }, [edges]);

  function isHighlit(id: string) { return hovered !== null && (id === hovered || (adjacency.get(hovered)?.has(id) ?? false)); }

  function labelPos(node: MapNode, pos: { x: number; y: number }): { x: number; y: number; anchor: "middle" | "start" | "end" } {
    if (node.type === "center") return { x: pos.x, y: pos.y, anchor: "middle" };
    // Push label in the direction away from the parent node
    let refX = cx, refY = cy;
    for (const e of edges) {
      if (e.targetId === node.id) {
        const p = positions.get(e.sourceId);
        if (p) { refX = p.x; refY = p.y; }
        break;
      }
    }
    const dx = pos.x - refX, dy = pos.y - refY;
    const dist = Math.hypot(dx, dy) || 1;
    const off = node.r + 10;
    const anchor: "middle" | "start" | "end" = Math.abs(dx / dist) < 0.3 ? "middle" : dx > 0 ? "start" : "end";
    return { x: pos.x + (dx / dist) * off, y: pos.y + (dy / dist) * off, anchor };
  }

  const ready = positions.size > 0;
  const isDragging = dragRef.current?.moved ?? false;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
      <button
        className="btn small ghost"
        type="button"
        style={{ position: "absolute", top: 10, right: 10, zIndex: 2, fontSize: "var(--text-xs)" }}
        onClick={() => {
          // Re-fit: recompute from current positions
          if (positions.size === 0) return;
          const pad = 60;
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const [, p] of positions) {
            minX = Math.min(minX, p.x - 80); maxX = Math.max(maxX, p.x + 80);
            minY = Math.min(minY, p.y - 30); maxY = Math.max(maxY, p.y + 30);
          }
          const gW = maxX - minX || 1, gH = maxY - minY || 1;
          const k = Math.min((W - pad * 2) / gW, (H - pad * 2) / gH, 1.8);
          setVp({ k, x: pad - minX * k, y: pad - minY * k });
        }}
      >
        Fit
      </button>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 580, display: "block", opacity: ready ? 1 : 0, transition: "opacity 0.25s", cursor: isDragging ? "grabbing" : "grab" }}
        aria-label="Topics mind map"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <radialGradient id="mm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={`translate(${vp.x},${vp.y}) scale(${vp.k})`}>
          <ellipse cx={cx} cy={cy} rx={350} ry={300} fill="url(#mm-glow)" />

          {edges.map((edge, i) => {
            const fp = positions.get(edge.sourceId);
            const tp = positions.get(edge.targetId);
            if (!fp || !tp) return null;
            const hi = hovered !== null && (edge.sourceId === hovered || edge.targetId === hovered);
            return (
              <line key={i} x1={fp.x} y1={fp.y} x2={tp.x} y2={tp.y}
                stroke={hi ? edge.color : "var(--border-strong)"}
                strokeWidth={hi ? 1.5 / vp.k : 0.8 / vp.k}
                strokeOpacity={hovered ? (hi ? 0.85 : 0.1) : 0.38}
              />
            );
          })}

          {nodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const hi = isHighlit(node.id);
            const dimmed = hovered !== null && !hi;
            const lp = labelPos(node, pos);
            const fontSize = node.type === "center" ? 11 : node.type === "category" ? 11 : 10;
            return (
              <g key={node.id}
                style={{ cursor: node.topicId ? "pointer" : "default" }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => { if (!dragRef.current?.moved) { node.topicId && navigate(`/topics/${node.topicId}`); } }}
              >
                {hi && node.type !== "center" && (
                  <circle cx={pos.x} cy={pos.y} r={node.r + 8} fill={node.color} fillOpacity={0.15} />
                )}
                <circle cx={pos.x} cy={pos.y} r={node.r}
                  fill={node.type === "center" ? "var(--accent)" : node.color}
                  fillOpacity={dimmed ? 0.1 : node.type === "topic" ? 0.6 : 0.85}
                  stroke={hi ? node.color : "var(--border)"}
                  strokeWidth={(hi ? 2 : 1) / vp.k}
                  strokeOpacity={dimmed ? 0.12 : 0.7}
                />
                <text x={lp.x} y={lp.y} dy="0.35em" textAnchor={lp.anchor}
                  fill={dimmed ? "var(--muted)" : hi ? "var(--text-primary)" : node.type === "center" ? "var(--accent-contrast)" : "var(--text-secondary)"}
                  fontSize={fontSize / vp.k}
                  fontWeight={node.type === "topic" ? 400 : 700}
                  paintOrder="stroke" stroke="var(--surface)" strokeWidth={3 / vp.k} strokeLinejoin="round"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="muted" style={{ fontSize: "var(--text-xs)", padding: "5px 14px 8px", margin: 0 }}>
        Scroll to zoom · drag to pan · click topic to open · node size = mastery
      </p>
    </div>
  );
}

export function TopicsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const { topics, sessions, questions, revisions } = store;
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortKey>("created");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function startRename(topicId: string, title: string) {
    setEditingId(topicId);
    setDraftTitle(title);
  }

  async function saveTitle(topic: Topic) {
    const next = draftTitle.trim();
    if (!next) { toast.warning("Topic name cannot be empty."); return; }
    if (next === topic.title) { setEditingId(""); return; }
    await store.updateTopic({ id: topic.id, title: next, description: topic.description, status: topic.status, mastery_score: topic.mastery_score });
    setEditingId("");
    toast.success("Topic renamed.");
  }

  async function deleteTopic(topicId: string, title: string) {
    const ok = await confirmDialog({ title: `Delete "${title}"?`, message: "Removes the topic and every session, cheatsheet link, question, and revision attached to it.", confirmLabel: "Delete topic", tone: "danger" });
    if (!ok) return;
    await store.deleteTopic(topicId);
    toast.success("Topic deleted.");
  }

  async function toggleSpacedRepetition(topic: Topic, enabled: boolean) {
    await store.setTopicSpacedRepetition(topic.id, enabled);
    toast.success(enabled ? `Spaced repetition on for "${topic.title}" — first review tomorrow.` : `Spaced repetition off for "${topic.title}".`);
  }

  const grouped = useMemo<TopicGroup[]>(() => {
    const map = new Map<string, TopicGroup>();
    for (const t of topics) {
      const catId = t.category_id ?? "uncategorized";
      if (!map.has(catId)) map.set(catId, { catId, catName: t.category_name ?? "Uncategorized", catColor: t.category_color ?? "", topics: [] });
      map.get(catId)!.topics.push(t);
    }
    for (const g of map.values()) {
      if (sort === "alpha") g.topics.sort((a, b) => a.title.localeCompare(b.title));
      else if (sort === "weak") g.topics.sort((a, b) => a.mastery_score - b.mastery_score);
      else g.topics.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    }
    return [...map.values()].sort((a, b) => a.catName.localeCompare(b.catName));
  }, [topics, sort]);

  function toggleCollapse(catId: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(catId) ? s.delete(catId) : s.add(catId); return s; });
  }

  function renderTopicCard(topic: Topic) {
    const topicSessions = sessions.filter(s => s.topic_id === topic.id);
    const topicQuestions = questions.filter(q => q.topic_id === topic.id);
    const pending = revisions.filter(r => r.topic_id === topic.id && r.status === "pending").length;
    const srEnabled = revisions.some(r => r.topic_id === topic.id && r.type === "topic_review" && r.status === "pending");
    const trend = topicTrend(topic.id, revisions);
    const isLate = topicHasLateRevision(topic.id, revisions);
    const edgeClass = isLate ? "edge-danger" : topic.status === "mastered" ? "edge-mastered" : "";
    return (
      <article
        className={`card link ${edgeClass}`}
        key={topic.id}
        tabIndex={0}
        role="link"
        onClick={(e) => { if ((e.target as HTMLElement).closest("button")) return; navigate(`/topics/${topic.id}`); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/topics/${topic.id}`); } }}
      >
        <div className="split">
          <span className="pill" style={{ borderColor: topic.category_color }}>{topic.category_name}</span>
          <div className="button-row">
            <button className="btn icon" aria-label={`Rename ${topic.title}`} onClick={(e) => { e.stopPropagation(); startRename(topic.id, topic.title); }}><Pencil size={16} /></button>
            <button className="btn danger icon" aria-label={`Delete ${topic.title}`} onClick={(e) => { e.stopPropagation(); void deleteTopic(topic.id, topic.title); }}><Trash2 size={16} /></button>
          </div>
        </div>
        {editingId === topic.id ? (
          <div className="button-row" style={{ margin: "8px 0 0 0" }} onClick={(e) => e.stopPropagation()}>
            <input className="input" value={draftTitle} autoFocus aria-label="Topic name"
              onChange={(e) => setDraftTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void saveTitle(topic); if (e.key === "Escape") setEditingId(""); }}
            />
            <button className="btn primary" onClick={(e) => { e.stopPropagation(); void saveTitle(topic); }}>Save</button>
            <button className="btn" onClick={(e) => { e.stopPropagation(); setEditingId(""); }}>Cancel</button>
          </div>
        ) : (
          <h2 style={{ margin: "8px 0 0 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="truncate">{topic.title}</span>
            {trend ? <TrendArrow trend={trend} /> : null}
          </h2>
        )}
        <p className="muted">{topic.description || "No description yet."}</p>
        <div className="progress"><span style={{ width: `${topic.mastery_score}%` }} /></div>
        <div className="split muted" style={{ fontSize: "var(--text-sm)" }}>
          <span>{topicSessions.length} sessions</span>
          <span>{topicQuestions.length} questions</span>
          <span>{pending} due</span>
        </div>
        <label className="toggle" style={{ fontSize: "var(--text-sm)", marginTop: 4 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={srEnabled} onChange={(e) => { e.stopPropagation(); void toggleSpacedRepetition(topic, e.target.checked); }} />
          <span>Spaced repetition</span>
        </label>
      </article>
    );
  }

  return (
    <>
      <PageHeader title="Topics" eyebrow="Knowledge homes for everything you are learning." />
      <div className="card button-row" style={{ flexWrap: "wrap" }}>
        <div className="button-row" role="radiogroup" aria-label="View mode">
          <button className={`btn small ${view === "list" ? "primary" : ""}`} type="button" onClick={() => setView("list")}>
            <LayoutGrid size={14} /> List
          </button>
          <button className={`btn small ${view === "map" ? "primary" : ""}`} type="button" onClick={() => setView("map")}>
            <Network size={14} /> Mind map
          </button>
        </div>
        {view === "list" && (
          <>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Sort</span>
            <div className="button-row" role="radiogroup" aria-label="Sort topics">
              <button className={`btn small ${sort === "created" ? "primary" : ""}`} type="button" onClick={() => setSort("created")}>Newest</button>
              <button className={`btn small ${sort === "alpha" ? "primary" : ""}`} type="button" onClick={() => setSort("alpha")}>A–Z</button>
              <button className={`btn small ${sort === "weak" ? "primary" : ""}`} type="button" onClick={() => setSort("weak")}>Weakest</button>
            </div>
            <button className="btn small ghost" type="button" style={{ marginLeft: "auto" }}
              onClick={() => setCollapsed(collapsed.size < grouped.length ? new Set(grouped.map(g => g.catId)) : new Set())}
            >
              {collapsed.size < grouped.length ? "Collapse all" : "Expand all"}
            </button>
          </>
        )}
      </div>
      {topics.length === 0 ? <EmptyState>Create a topic from Today to begin building your study map.</EmptyState> : null}
      {view === "map" ? (
        <div style={{ marginTop: 20 }}>
          <TopicMindMap grouped={grouped} navigate={navigate} />
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {grouped.map(({ catId, catName, catColor, topics: catTopics }) => {
            const isOpen = !collapsed.has(catId);
            return (
              <div key={catId} style={{ marginBottom: 20 }}>
                <button className="topics-cat-header" type="button" onClick={() => toggleCollapse(catId)} aria-expanded={isOpen}>
                  <span className="topics-cat-dot" style={{ background: catColor || "var(--accent)" }} />
                  <span className="topics-cat-name">{catName}</span>
                  <span className="pill" style={{ fontSize: "var(--text-xs)", padding: "1px 8px" }}>{catTopics.length}</span>
                  <ChevronRight size={15} className={`topics-cat-chevron${isOpen ? " open" : ""}`} aria-hidden />
                </button>
                {isOpen && (
                  <section className="grid three" style={{ marginTop: 10 }}>
                    {catTopics.map(renderTopicCard)}
                  </section>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function TopicDetailPage() {
  const { topicId } = useParams();
  const { topics, sessions, cheatsheets, questionSets, questions, revisions, links } = useAppStore();
  const getTopicAttempts = useAppStore((state) => state.getTopicAttempts);
  const [attempts, setAttempts] = useState<ReviewAttempt[]>([]);

  useEffect(() => {
    if (!topicId) {
      setAttempts([]);
      return;
    }
    let alive = true;
    void getTopicAttempts(topicId).then((rows) => {
      if (alive) setAttempts(rows);
    });
    return () => {
      alive = false;
    };
  }, [topicId, getTopicAttempts, questions]);

  const topic = topics.find((item) => item.id === topicId);

  if (!topic) return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <EmptyState>Topic not found.</EmptyState>
    </>
  );

  const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
  const totalMinutes = topicSessions.reduce((sum, session) => sum + sessionFocusMinutes(session), 0);
  const topicSheets = cheatsheets.filter((item) => item.topic_id === topic.id);
  const topicSets = questionSets.filter((item) => item.topic_id === topic.id);
  const topicQuestions = questions.filter((item) => item.topic_id === topic.id);
  const topicRevisions = revisions.filter((item) => item.topic_id === topic.id);
  const topicLinks = links.filter((item) => item.topic_id === topic.id);
  const practice = topicPracticeStats(attempts);

  return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <PageHeader title={topic.title} eyebrow={`${topic.category_name} · ${topic.status}`} />
      <section className="grid three">
        <div className="card stat"><span className="muted">Mastery</span><strong>{topic.mastery_score}%</strong></div>
        <div className="card stat"><span className="muted">Focused time</span><strong>{formatMinutes(totalMinutes)}</strong></div>
        <div className="card stat"><span className="muted">Next revision</span><strong>{topic.next_revision_at ? formatDistanceToNow(parseISO(topic.next_revision_at), { addSuffix: true }) : "None"}</strong></div>
      </section>
      <section className="grid four" style={{ marginTop: 20 }}>
        <div className="card stat"><span className="muted">Practiced time</span><strong>{formatMinutes(practice.minutes)}</strong></div>
        <div className="card stat"><span className="muted">Cards reviewed</span><strong>{practice.cards}</strong></div>
        <div className="card stat"><span className="muted">Recall accuracy</span><strong>{practice.accuracy === null ? "—" : `${practice.accuracy}%`}</strong></div>
        <div className="card stat"><span className="muted">Last practiced</span><strong>{practice.lastPracticedAt ? formatDistanceToNow(parseISO(practice.lastPracticedAt), { addSuffix: true }) : "Never"}</strong></div>
      </section>
      <section className="grid two" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Sessions</h2>
          {topicSessions.length ? (
            <div className="list">
              {topicSessions.map((session) => (
                <div className="list-item" key={session.id}>
                  <div className="split">
                    <span>{session.title}</span>
                    <span className="muted">{session.pomodoros_completed} pomodoros</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No sessions yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Cheatsheets</h2>
          {topicSheets.length ? (
            <div className="list">
              {topicSheets.map((sheet) => (
                <div className="list-item" key={sheet.id}>
                  <div className="split">
                    <span className="truncate" title={sheet.file_path}>{sheet.title}</span>
                    <button className="btn small" onClick={() => void openLocalPath(sheet.file_path)}><ExternalLink size={14} />Open</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No cheatsheets yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Question sets</h2>
          {topicSets.length ? (
            <div className="list">
              {topicSets.map((set) => {
                const count = topicQuestions.filter((q) => q.question_set_id === set.id).length;
                return (
                  <div className="list-item" key={set.id}>
                    <div className="split">
                      <span>{set.title}</span>
                      <span className="muted">{count} questions</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState>No question sets yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Active recall</h2>
          {topicQuestions.length ? (
            <div className="list">
              {topicQuestions.slice(0, 8).map((q) => (
                <div className="list-item" key={q.id}>
                  <div className="split">
                    <span className="truncate" title={q.question}>{q.question}</span>
                    <span className="muted">{q.mastery_score}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No questions yet.</EmptyState>}
        </div>

        <div className="card grid">
          <h2>Revision timeline</h2>
          {(() => {
            const completedHistory = topicRevisions
              .filter((r) => r.status === "completed" && r.completed_at)
              .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : 1));
            const upcoming = topicRevisions
              .filter((r) => r.status === "pending")
              .sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
            if (completedHistory.length === 0 && upcoming.length === 0) {
              return <EmptyState>No revisions scheduled.</EmptyState>;
            }
            return (
              <>
                {completedHistory.length ? (
                  <>
                    <p className="muted" style={{ margin: 0 }}>{completedHistory.length} past review{completedHistory.length === 1 ? "" : "s"} · {summarizeRevisions(completedHistory)}</p>
                    <RevisionHistoryTimeline history={completedHistory} ariaLabel={`Past revisions for ${topic.title}`} />
                  </>
                ) : <p className="muted" style={{ margin: 0 }}>No past reviews yet.</p>}
                {upcoming.length ? (
                  <div className="list" style={{ marginTop: 8 }}>
                    {upcoming.slice(0, 5).map((revision) => (
                      <div className="list-item" key={revision.id}>
                        <div className="split">
                          <span>{formatDistanceToNow(parseISO(revision.due_at), { addSuffix: true })}</span>
                          <span className="muted">upcoming</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>

        <div className="card">
          <h2>Resource links</h2>
          {topicLinks.length ? (
            <div className="list">
              {topicLinks.map((link) => {
                const Icon = link.kind === "chatgpt" ? MessageSquare
                  : link.kind === "video" ? Video
                  : link.kind === "docs" ? FileText
                  : link.kind === "article" ? BookOpen
                  : ExternalLink;
                return (
                  <div className="list-item" key={link.id}>
                    <div className="split">
                      <span className="truncate" title={link.url}>
                        <Icon size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                        {link.title || link.url}
                      </span>
                      <button className="btn small" onClick={() => void openLocalPath(link.url)} title={link.url}>
                        <ExternalLink size={14} />Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState>No links yet.</EmptyState>}
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <div className="card grid">
          <h2>Performance</h2>
          <p className="muted" style={{ margin: 0 }}>Each cell is one practice attempt, oldest → newest, colored by how you rated recall. Click a cell to see that attempt.</p>
          <QuestionScoreHeatmap key={topic.id} questions={topicQuestions} attempts={attempts} />
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <TopicJournalSection topicId={topic.id} />
      </section>
    </>
  );
}
