import { useState } from 'react'
import './App.css'
import { Activity, LayoutDashboard, MessageSquare, Settings } from 'lucide-react'
import { Dashboard } from './components/Dashboard'
import { Chat } from './components/Chat'

function App() {
    const [view, setView] = useState<'dashboard' | 'chat'>('dashboard')

    return (
        <div className="layout">
            <aside className="sidebar">
                <div className="logo">LokaFlow™</div>
                <nav>
                    <a href="#" className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
                        <LayoutDashboard size={18} /> Dashboard
                    </a>
                    <a href="#" className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
                        <MessageSquare size={18} /> Chat
                    </a>
                    <a href="#"><Activity size={18} /> Mesh Cluster</a>
                    <a href="#"><Settings size={18} /> Settings</a>
                </nav>
            </aside>
            <main className="content">
                {view === 'dashboard' ? <Dashboard /> : <Chat />}
            </main>
        </div>
    )
}

export default App
