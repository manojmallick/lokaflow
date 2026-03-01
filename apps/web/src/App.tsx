import { useState } from "react";
import "./App.css";
import { Activity, LayoutDashboard, MessageSquare, Settings } from "lucide-react";
import { Dashboard } from "./components/Dashboard";
import { Chat } from "./components/Chat";
import { MeshCluster } from "./components/MeshCluster";
import { Settings as SettingsView } from "./components/Settings";

type View = "dashboard" | "chat" | "mesh" | "settings";

function App(): JSX.Element {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">LokaFlow™</div>
        <nav>
          <a
            href="#"
            className={view === "dashboard" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setView("dashboard");
            }}
          >
            <LayoutDashboard size={18} /> Dashboard
          </a>
          <a
            href="#"
            className={view === "chat" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setView("chat");
            }}
          >
            <MessageSquare size={18} /> Chat
          </a>
          <a
            href="#"
            className={view === "mesh" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setView("mesh");
            }}
          >
            <Activity size={18} /> Mesh Cluster
          </a>
          <a
            href="#"
            className={view === "settings" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setView("settings");
            }}
          >
            <Settings size={18} /> Settings
          </a>
        </nav>
      </aside>
      <main className={`content${view === "chat" ? " content-chat" : ""}`}>
        {view === "dashboard" && <Dashboard />}
        {view === "chat" && <Chat />}
        {view === "mesh" && <MeshCluster />}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

export default App;
