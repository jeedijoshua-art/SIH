import { useState, useEffect, useRef } from 'react';
import { Shield, Send, CheckCircle2, XCircle, AlertCircle, Eye, BrainCircuit, Activity } from 'lucide-react';

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [agentStatus, setAgentStatus] = useState('Idle');
  const [agentState, setAgentState] = useState('IDLE');
  const [visionStatus, setVisionStatus] = useState('NOT INITIALIZED');
  const [vlmStatus, setVlmStatus] = useState('NOT INITIALIZED');
  const [currentTraces, setCurrentTraces] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ action: 'GET_HISTORY' }, (response) => {
        if (response && response.history) {
            setMessages(response.history);
        }
    });

    const listener = (message: any) => {
      if (message.action === 'AGENT_STATUS') {
        setAgentStatus(message.status);
      } else if (message.action === 'AGENT_TRACE') {
        setCurrentTraces(prev => [...prev, message.trace]);
      } else if (message.action === 'AGENT_INIT') {
        if (message.visionStatus) setVisionStatus(message.visionStatus);
        if (message.vlmStatus) setVlmStatus(message.vlmStatus);
        if (message.agentStatus) {
            setAgentState(message.agentStatus);
            if (message.agentStatus === 'RUNNING') {
                setCurrentTraces([]);
            }
        }
      } else if (message.action === 'CHAT_RESPONSE') {
        setMessages(prev => [...prev, { role: 'assistant', content: message.message }]);
      } else if (message.action === 'NEEDS_USER') {
        setAgentState('WAITING_FOR_USER');
      } else if (message.action === 'AGENT_COMPLETE' || message.action === 'AGENT_ERROR') {
        setAgentState(message.action === 'AGENT_ERROR' ? 'FAILED' : 'COMPLETED');
        setAgentStatus(message.action === 'AGENT_ERROR' ? `Error: ${message.error}` : 'Task Complete');
      } else if (message.action === 'HISTORY_UPDATED') {
          setMessages(message.history);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTraces, agentStatus]);

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    chrome.runtime.sendMessage({ action: 'SEND_MESSAGE', text });
  };

  const handleConfirm = (confirmed: boolean) => {
      setAgentState(confirmed ? 'RUNNING' : 'STOPPED');
      chrome.runtime.sendMessage({ action: 'CONFIRM_ACTION', confirmed });
  };

  return (
    <div className="w-full h-screen flex flex-col bg-slate-50 text-slate-800 text-sm overflow-hidden">
      {/* Header */}
      <header className="flex flex-col p-4 pb-2 border-b border-slate-200 bg-white shadow-sm z-10">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            <h1 className="font-bold text-lg">LocalSight</h1>
            </div>
            <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1"><Eye className={`w-3 h-3 ${visionStatus.includes('ACTIVE') ? 'text-indigo-600' : 'text-slate-400'}`} /> Vision</span>
                <span className="flex items-center gap-1"><BrainCircuit className={`w-3 h-3 ${vlmStatus.includes('ACTIVE') ? 'text-green-600' : 'text-slate-400'}`} /> Groq</span>
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
            <div className="text-center text-slate-400 mt-10">
                <p>Hello! I am your conversational browser agent.</p>
                <p className="text-xs mt-2">Try: "Open Settings" or "Download the invoice for Gamma Tech"</p>
            </div>
        )}
        {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
                    <div className="max-w-[85%] p-3 rounded-lg bg-indigo-600 text-white rounded-br-none shadow-sm">
                        {msg.content}
                    </div>
                ) : msg.role === 'trace' ? (
                    <div className="max-w-[95%] p-3 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm font-mono text-xs space-y-1">
                        <div className="text-indigo-600 font-bold mb-2 uppercase text-[10px]">Agent Trace</div>
                        {msg.traces.map((t: string, j: number) => (
                            <div key={j} className="whitespace-pre-wrap">{t}</div>
                        ))}
                    </div>
                ) : (
                    <div className="max-w-[85%] p-3 rounded-lg bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm">
                        {msg.content}
                    </div>
                )}
            </div>
        ))}

        {agentState === 'RUNNING' && (
            <div className="flex flex-col items-start space-y-2">
                {currentTraces.length > 0 && (
                    <div className="max-w-[95%] p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-slate-700 shadow-sm font-mono text-xs space-y-1">
                        <div className="text-indigo-600 font-bold mb-2 uppercase text-[10px]">Active Trace</div>
                        {currentTraces.map((t, j) => (
                            <div key={j} className="whitespace-pre-wrap animate-fade-in">{t}</div>
                        ))}
                    </div>
                )}
                <div className="bg-white border border-slate-200 text-slate-600 text-xs p-2 rounded-full px-3 flex items-center gap-2 shadow-sm">
                    <Activity className="w-3 h-3 animate-pulse text-indigo-600" />
                    <span>{agentStatus}</span>
                </div>
            </div>
        )}

        {agentState === 'WAITING_FOR_USER' && (
            <div className="flex flex-col items-center p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 my-2 shadow-sm">
                <AlertCircle className="w-6 h-6 mb-2" />
                <p className="text-center mb-3 font-medium">Confirmation Required</p>
                <div className="flex gap-2">
                    <button onClick={() => handleConfirm(true)} className="flex items-center gap-1 px-4 py-1.5 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition font-medium"><CheckCircle2 className="w-4 h-4" /> Confirm</button>
                    <button onClick={() => handleConfirm(false)} className="flex items-center gap-1 px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition font-medium"><XCircle className="w-4 h-4" /> Cancel</button>
                </div>
            </div>
        )}

        {agentState === 'COMPLETED' && (
            <div className="flex flex-col items-center p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 my-2 shadow-sm">
                <CheckCircle2 className="w-6 h-6 mb-2" />
                <p className="text-center mb-1 font-bold">Task Completed Successfully</p>
            </div>
        )}

        {agentState === 'FAILED' && (
            <div className="flex flex-col items-center p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 my-2 shadow-sm">
                <XCircle className="w-6 h-6 mb-2" />
                <p className="text-center mb-1 font-bold">Task Failed</p>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2 relative">
          <textarea
            className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none resize-none bg-slate-50"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            }}
            placeholder="Type a command..."
          />
          <button onClick={handleSend} disabled={!input.trim()} className="absolute right-2 top-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50 transition">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
