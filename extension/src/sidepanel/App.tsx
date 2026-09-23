import { useState, useEffect, useRef } from 'react';
import { Shield, Send, CheckCircle2, XCircle, AlertCircle, Eye, BrainCircuit, Activity, Moon, Sun, Bot } from 'lucide-react';

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [agentStatus, setAgentStatus] = useState('Idle');
  const [agentState, setAgentState] = useState('IDLE');
  const [visionStatus, setVisionStatus] = useState('NOT INITIALIZED');
  const [vlmStatus, setVlmStatus] = useState('NOT INITIALIZED');
  const [currentTraces, setCurrentTraces] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial loading sequence
    const timer = setTimeout(() => {
        setIsAppLoading(false);
    }, 1200);

    // Theme initialization
    chrome.storage.local.get(['theme'], (result) => {
        if (result.theme === 'dark') {
            setDarkMode(true);
            document.documentElement.classList.add('dark');
        }
    });

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
    return () => {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTraces, agentStatus]);

  const toggleTheme = () => {
      const newTheme = !darkMode;
      setDarkMode(newTheme);
      if (newTheme) {
          document.documentElement.classList.add('dark');
          chrome.storage.local.set({ theme: 'dark' });
      } else {
          document.documentElement.classList.remove('dark');
          chrome.storage.local.set({ theme: 'light' });
      }
  };

  const handleSend = () => {
    if (!input.trim() || agentState === 'RUNNING' || agentState === 'WAITING_FOR_USER') return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    chrome.runtime.sendMessage({ action: 'SEND_MESSAGE', text });
  };

  const handleConfirm = (confirmed: boolean) => {
      setAgentState(confirmed ? 'RUNNING' : 'STOPPED');
      chrome.runtime.sendMessage({ action: 'CONFIRM_ACTION', confirmed });
  };

  const handleExampleClick = (text: string) => {
      setInput(text);
  };

  if (isAppLoading) {
      return (
          <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
              <Shield className="w-12 h-12 text-indigo-600 animate-pulse mb-4" />
              <h1 className="font-bold text-2xl text-slate-800 dark:text-slate-100 mb-2">LocalSight</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Your browser, understood.</p>
              <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
          </div>
      );
  }

  return (
    <div className={`w-full h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm overflow-hidden transition-colors duration-300`}>
      {/* Header */}
      <header className="flex flex-col p-4 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm z-10 transition-colors duration-300">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-500" />
                <h1 className="font-bold text-lg text-slate-900 dark:text-white">LocalSight</h1>
            </div>
            <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1" title="Vision Status"><Eye className={`w-3.5 h-3.5 ${visionStatus.includes('ACTIVE') ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600'}`} /></span>
                <span className="flex items-center gap-1" title="Groq Status"><BrainCircuit className={`w-3.5 h-3.5 ${vlmStatus.includes('ACTIVE') ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-600'}`} /></span>
                <button onClick={toggleTheme} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400 mt-12 animate-fade-in">
                <div className="text-4xl mb-4">👋</div>
                <p className="font-medium text-slate-700 dark:text-slate-300 mb-6">What can I help you do?</p>
                <div className="space-y-2 w-full max-w-[240px]">
                    <button onClick={() => handleExampleClick("Open Google in a new tab")} className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all text-xs">
                        "Open Google in a new tab"
                    </button>
                    <button onClick={() => handleExampleClick("Search for Python tutorials")} className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all text-xs">
                        "Search for Python tutorials"
                    </button>
                    <button onClick={() => handleExampleClick("Show my open tabs")} className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm transition-all text-xs">
                        "Show my open tabs"
                    </button>
                </div>
            </div>
        )}
        
        {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                {msg.role === 'user' ? (
                    <div className="max-w-[85%] p-3.5 rounded-2xl bg-indigo-600 text-white rounded-br-sm shadow-sm">
                        {msg.content}
                    </div>
                ) : msg.role === 'trace' ? (
                    <div className="max-w-[95%] p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 shadow-sm font-mono text-[11px] space-y-1">
                        <div className="text-indigo-600 dark:text-indigo-400 font-bold mb-1 uppercase">Agent Trace</div>
                        {msg.traces.map((t: string, j: number) => (
                            <div key={j} className="whitespace-pre-wrap">{t}</div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-start gap-2 max-w-[85%]">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0 mt-1">
                            <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-sm shadow-sm leading-relaxed">
                            {msg.content}
                        </div>
                    </div>
                )}
            </div>
        ))}

        {agentState === 'RUNNING' && (
            <div className="flex items-start gap-2 max-w-[90%] animate-fade-in">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0 mt-1">
                    <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin-slow" />
                </div>
                <div className="flex flex-col space-y-2 w-full">
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-bl-sm shadow-sm">
                        <div className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            Understanding your request...
                        </div>
                        {currentTraces.length > 0 && (
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 space-y-1">
                                {currentTraces.slice(-3).map((t, j) => (
                                    <div key={j} className="truncate animate-fade-in">{t}</div>
                                ))}
                            </div>
                        )}
                        <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-2">
                            Status: {agentStatus}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {agentState === 'WAITING_FOR_USER' && (
            <div className="flex flex-col items-center p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-2xl text-orange-800 dark:text-orange-200 my-2 shadow-sm animate-fade-in">
                <AlertCircle className="w-6 h-6 mb-2 text-orange-500" />
                <p className="text-center mb-3 font-medium">Confirmation Required</p>
                <div className="flex gap-2 w-full justify-center">
                    <button onClick={() => handleConfirm(true)} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-medium text-xs flex-1 max-w-[120px]">
                        <CheckCircle2 className="w-4 h-4" /> Confirm
                    </button>
                    <button onClick={() => handleConfirm(false)} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium text-xs flex-1 max-w-[120px]">
                        <XCircle className="w-4 h-4" /> Cancel
                    </button>
                </div>
            </div>
        )}

        {agentState === 'COMPLETED' && (
            <div className="flex items-center gap-2 p-2 px-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-full text-green-700 dark:text-green-400 text-xs font-medium w-max shadow-sm animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" /> Task completed
            </div>
        )}

        {agentState === 'FAILED' && (
            <div className="flex flex-col p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-red-700 dark:text-red-400 text-xs shadow-sm animate-fade-in max-w-[90%]">
                <div className="flex items-center gap-2 font-medium mb-1"><XCircle className="w-3.5 h-3.5" /> Task failed</div>
                <div className="opacity-80 leading-relaxed">{agentStatus}</div>
            </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="flex gap-2 relative items-end">
          <textarea
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-12 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-indigo-500/30 focus:border-indigo-500 outline-none resize-none text-slate-800 dark:text-slate-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            rows={1}
            value={input}
            disabled={agentState === 'RUNNING' || agentState === 'WAITING_FOR_USER'}
            onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            }}
            placeholder="Tell LocalSight what to do..."
        />
          <button 
            onClick={handleSend} 
            disabled={!input.trim() || agentState === 'RUNNING' || agentState === 'WAITING_FOR_USER'} 
            className="absolute right-2 bottom-2 p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
