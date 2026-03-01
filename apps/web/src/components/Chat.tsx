import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function Chat() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I am LokaFlow. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            // Assuming LokaFlow REST API is running on localhost:4141
            const res = await fetch('http://localhost:4141/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'auto',
                    messages: [...messages, { role: 'user', content: userMsg }].map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    stream: false
                })
            });

            if (!res.ok) throw new Error('API Error');

            const data = await res.json();
            const reply = data.choices[0]?.message?.content || 'No response';

            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not connect to LokaFlow API on port 4141.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`message-wrapper ${msg.role}`}>
                        <div className="avatar">
                            {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
                        </div>
                        <div className="message-bubble">
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="message-wrapper assistant">
                        <div className="avatar"><Bot size={20} /></div>
                        <div className="message-bubble loading">
                            <Loader2 size={16} className="spin" /> Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask LokaFlow..."
                    disabled={isLoading}
                />
                <button type="submit" disabled={!input.trim() || isLoading}>
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
