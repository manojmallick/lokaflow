import { useState, useEffect } from "react";
import "./App.css";
import {
  Activity,
  BarChart2,
  BookOpen,
  Calendar,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";
import { Dashboard } from "./components/Dashboard";
import { Chat } from "./components/Chat";
import { MeshCluster } from "./components/MeshCluster";
import { Settings as SettingsView } from "./components/Settings";
import { PromptLibrary } from "./components/PromptLibrary";
import { LokaAudit } from "./components/LokaAudit";
import { History } from "./components/History";
import { BatchScheduler } from "./components/BatchScheduler";
import { Playground } from "./components/Playground";

type View = "dashboard" | "chat" | "mesh" | "settings" | "prompts" | "audit" | "playground" | "history" | "batch";
type SettingsTab = "connection" | "routing" | "keys" | "budget" | "privacy" | "notifications" | "appearance";

const VALID_VIEWS: View[] = ["dashboard", "chat", "mesh", "settings", "prompts", "audit", "playground", "history", "batch"];
const VALID_SETTINGS_TABS: SettingsTab[] = ["connection", "routing", "keys", "budget", "privacy", "notifications", "appearance"];

function parseHash(): { view: View; settingsTab?: SettingsTab } {
  const raw = window.location.hash.slice(1); // e.g. "settings/routing"
  const [viewPart, subPart] = raw.split("/");
  const view: View = VALID_VIEWS.includes(viewPart as View) ? (viewPart as View) : "dashboard";
  const settingsTab = VALID_SETTINGS_TABS.includes(subPart as SettingsTab) ? (subPart as SettingsTab) : undefined;
  return { view, settingsTab };
}

function getViewFromHash(): View {
  return parseHash().view;
}

function NavLink({
  id,
  active,
  onClick,
  children,
}: {
  id: View;
  active: View;
  onClick: (v: View) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`#${id}`}
      className={active === id ? "active" : ""}
      onClick={(e) => {
        e.preventDefault();
        onClick(id);
      }}
    >
      {children}
    </a>
  );
}

function App(): JSX.Element {
  const [view, setView] = useState<View>(getViewFromHash);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>(() => parseHash().settingsTab);

  useEffect(() => {
    const handler = () => {
      const { view: v, settingsTab: st } = parseHash();
      setView(v);
      setSettingsTab(st);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  function navigate(v: View, sub?: SettingsTab) {
    window.location.hash = sub ? `${v}/${sub}` : v;
    setView(v);
    setSettingsTab(sub);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">LokaFlow™</div>
        <nav>
          <NavLink id="dashboard" active={view} onClick={navigate}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <NavLink id="chat" active={view} onClick={navigate}>
            <MessageSquare size={18} /> Chat
          </NavLink>
          <NavLink id="mesh" active={view} onClick={navigate}>
            <Activity size={18} /> Mesh Cluster
          </NavLink>

          <div className="nav-divider" />

          <NavLink id="prompts" active={view} onClick={navigate}>
            <BookOpen size={18} /> Prompt Library
          </NavLink>
          <NavLink id="audit" active={view} onClick={navigate}>
            <BarChart2 size={18} /> Savings Audit
          </NavLink>
          <NavLink id="history" active={view} onClick={navigate}>
            <Search size={18} /> History
          </NavLink>
          <NavLink id="batch" active={view} onClick={navigate}>
            <Calendar size={18} /> Batch &amp; Schedule
          </NavLink>
          <NavLink id="playground" active={view} onClick={navigate}>
            <FlaskConical size={18} /> Playground
          </NavLink>

          <div className="nav-divider" />

          <NavLink id="settings" active={view} onClick={navigate}>
            <Settings size={18} /> Settings
          </NavLink>
        </nav>
      </aside>
      <main className={`content${view === "chat" ? " content-chat" : ""}`}>
        {/* Chat is always mounted so in-flight LLM responses survive navigation */}
        <div style={{ display: view === "chat" ? "contents" : "none" }}>
          <Chat />
        </div>
        {view === "dashboard" && <Dashboard onNavigate={(v) => navigate(v as View)} />}
        {view === "mesh" && <div className="content-padded"><MeshCluster /></div>}
        {view === "settings" && <SettingsView initialTab={settingsTab} onTabChange={(t) => navigate("settings", t as SettingsTab)} />}
        {view === "prompts" && <PromptLibrary />}
        {view === "audit" && <LokaAudit />}
        {view === "history" && <div className="content-padded"><History /></div>}
        {view === "batch" && <div className="content-padded"><BatchScheduler /></div>}
        {view === "playground" && <div className="content-padded"><Playground /></div>}
      </main>
    </div>
  );
}

export default App;

