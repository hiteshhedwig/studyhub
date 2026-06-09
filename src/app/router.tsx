import { createHashRouter } from "react-router-dom";
import { App } from "./App";
import { TodayPage } from "../features/today/TodayPage";
import { SessionsPage } from "../features/sessions/SessionsPage";
import { TopicsPage, TopicDetailPage } from "../features/topics/TopicsPage";
import { CheatsheetsPage } from "../features/cheatsheets/CheatsheetsPage";
import { MaterialsPage } from "../features/materials/MaterialsPage";
import { QuestionBankPage } from "../features/questionBank/QuestionBankPage";
import { PracticePage } from "../features/practice/PracticePage";
import { RevisionsPage } from "../features/revisions/RevisionsPage";
import { StatsPage } from "../features/stats/StatsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { MiniOverlay } from "../features/overlay/MiniOverlay";
import { CatPet } from "../features/catpet/CatPet";

export const router = createHashRouter([
  { path: "/overlay", element: <MiniOverlay /> },
  { path: "/catpet", element: <CatPet /> },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "sessions", element: <SessionsPage /> },
      { path: "topics", element: <TopicsPage /> },
      { path: "topics/:topicId", element: <TopicDetailPage /> },
      { path: "cheatsheets", element: <CheatsheetsPage /> },
      { path: "materials", element: <MaterialsPage /> },
      { path: "question-bank", element: <QuestionBankPage /> },
      { path: "practice", element: <PracticePage /> },
      { path: "revisions", element: <RevisionsPage /> },
      { path: "stats", element: <StatsPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);
