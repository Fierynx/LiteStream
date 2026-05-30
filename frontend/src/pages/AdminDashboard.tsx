import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, Activity, Terminal, AlertTriangle, 
  Loader2, LogOut, ArrowDown, ShieldAlert
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logs, setLogs] = useState<string>('');
  const [infraStatus, setInfraStatus] = useState<string>('UNKNOWN');
  const [activeTab, setActiveTab] = useState<'infra' | 'logs'>('infra');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  
  // UX States
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [showDestroyModal, setShowDestroyModal] = useState(false);
  const [destroyInput, setDestroyInput] = useState('');
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (token) {
      checkInfraStatus();
      fetchEvents();
    }
  }, [token]);

  // Smart Auto-Polling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (infraStatus.includes('IN_PROGRESS')) {
      interval = setInterval(() => {
        checkInfraStatus();
        fetchEvents();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [infraStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('adminToken', data.token);
        setToken(data.token);
      } else {
        showToast('Invalid credentials', 'error');
      }
    } catch (err) {
      showToast('Login failed', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
  };

  const checkInfraStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/infra/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInfraStatus(data.status);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/infra/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async (container: string) => {
    setLogs('Fetching...');
    try {
      const res = await fetch(`${API_URL}/admin/logs/${container}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.text());
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setLogs('Failed to fetch logs');
      }
    } catch (err) {
      setLogs('Connection error');
    }
  };

  const provisionInfra = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/infra/provision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Deploying Infrastructure', 'success');
        checkInfraStatus();
        fetchEvents();
      } else {
        showToast('Deploy Failed', 'error');
      }
    } catch (err) {
      showToast('Deploy Error', 'error');
    }
    setLoading(false);
  };

  const deprovisionInfra = async () => {
    if (destroyInput !== 'DESTROY') return;
    
    setShowDestroyModal(false);
    setDestroyInput('');
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/admin/infra/deprovision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Deprovisioning Initiated', 'success');
        checkInfraStatus();
        fetchEvents();
      } else {
        showToast('Failed to destroy', 'error');
      }
    } catch (err) {
      showToast('Destroy Error', 'error');
    }
    setLoading(false);
  };

  // Colorize logs helper
  const renderColorizedLogs = () => {
    if (!logs) return <div className="text-zinc-500 italic">Select a container to view logs</div>;
    return logs.split('\n').map((line, i) => {
      let colorClass = 'text-green-400';
      if (line.includes('ERROR') || line.includes('FATAL') || line.toLowerCase().includes('fail')) colorClass = 'text-red-400';
      else if (line.includes('WARN')) colorClass = 'text-amber-400';
      else if (line.includes('INFO')) colorClass = 'text-blue-300';
      return <div key={i} className={`${colorClass} break-all`}>{line}</div>;
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white relative overflow-hidden">
        {/* Abstract background blur */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px]"></div>
        
        {toast && (
          <div className={`fixed top-6 right-6 px-6 py-3 rounded-lg shadow-2xl backdrop-blur-md border animate-in slide-in-from-top-4 fade-in z-50 ${toast.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-green-500/20 border-green-500/50 text-green-200'}`}>
            {toast.message}
          </div>
        )}

        <div className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-2xl border border-zinc-800/50 w-full max-w-sm shadow-2xl relative z-10">
          <div className="flex items-center justify-center mb-8">
            <ShieldAlert className="w-8 h-8 text-purple-500 mr-3" />
            <h2 className="text-2xl font-bold tracking-tight">Admin</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-zinc-600"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-zinc-600"
            />
            <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-lg transition-all active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  const inProgress = infraStatus.includes('IN_PROGRESS');
  const isFailed = infraStatus.includes('FAILED') || infraStatus.includes('ROLLBACK');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 md:p-12 relative font-sans">
      
      {toast && (
        <div className={`fixed top-6 right-6 px-6 py-3 rounded-lg shadow-2xl backdrop-blur-md border z-50 flex items-center space-x-3 transition-opacity ${toast.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-green-500/20 border-green-500/50 text-green-200'}`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Destroy Confirmation Modal */}
      {showDestroyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-2xl w-full max-w-md shadow-[0_0_50px_rgba(239,68,68,0.15)]">
            <h3 className="text-xl font-bold text-white mb-2">Destructive Action</h3>
            <p className="text-sm text-zinc-400 mb-6">This will permanently delete all AWS resources. To confirm, type <strong className="text-red-400 select-all">DESTROY</strong> below.</p>
            <input 
              type="text" 
              value={destroyInput} 
              onChange={e => setDestroyInput(e.target.value)}
              placeholder="Type DESTROY" 
              className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-red-400 font-mono tracking-widest focus:outline-none focus:border-red-500 mb-6 uppercase"
            />
            <div className="flex space-x-3">
              <button onClick={() => setShowDestroyModal(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
              <button 
                onClick={deprovisionInfra}
                disabled={destroyInput !== 'DESTROY'}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-white/5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-zinc-500 text-sm mt-1">Manage infrastructure and system services</p>
          </div>
          <div className="flex items-center space-x-2 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
            <button onClick={() => setActiveTab('infra')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'infra' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <Server className="w-4 h-4 mr-2" /> Infra
            </button>
            <button onClick={() => setActiveTab('logs')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'logs' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <Terminal className="w-4 h-4 mr-2" /> Logs
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-2"></div>
            <button onClick={handleLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab: Infrastructure */}
        {activeTab === 'infra' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Actions Panel */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium text-zinc-400">Status</span>
                  <div className={`flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${inProgress ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : isFailed ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                    {inProgress && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping mr-2"></span>}
                    {!inProgress && <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isFailed ? 'bg-red-400' : 'bg-emerald-400'}`}></span>}
                    {infraStatus}
                  </div>
                </div>

                <div className="space-y-3">
                  <button onClick={provisionInfra} disabled={loading || inProgress} className="w-full group relative flex items-center justify-center bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-semibold py-3 px-4 rounded-xl transition-all">
                    {loading && !inProgress ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Deploy Infrastructure
                  </button>
                  <button onClick={() => setShowDestroyModal(true)} disabled={loading || inProgress || infraStatus === 'DOES_NOT_EXIST'} className="w-full flex items-center justify-center bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 font-medium py-3 px-4 rounded-xl transition-all">
                    Destroy Stack
                  </button>
                </div>
              </div>
            </div>

            {/* Events Timeline Panel */}
            <div className="lg:col-span-2">
              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm h-[600px] flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-zinc-100 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-purple-400" />
                    Stack Events
                  </h3>
                  {inProgress && <span className="text-xs text-zinc-500 animate-pulse">Auto-polling active...</span>}
                </div>

                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  {events.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic">
                      No events found
                    </div>
                  ) : (
                    <div className="relative border-l border-zinc-800 ml-3 space-y-6 pb-4">
                      {events.map((e, idx) => {
                        const isErr = e.resource_status.includes('FAILED');
                        const isSucc = e.resource_status.includes('COMPLETE');
                        
                        return (
                          <div key={idx} className="relative pl-6">
                            <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-[#0a0a0a] ${isErr ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : isSucc ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-1">
                              <span className="text-sm font-medium text-zinc-200">{e.logical_resource_id}</span>
                              <span className="text-[10px] text-zinc-500 font-mono mt-1 sm:mt-0">{new Date(e.timestamp).toLocaleTimeString([], {hour12:false})}</span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500 truncate mr-4">{e.resource_type}</span>
                              <span className={`text-[10px] font-mono tracking-wider ${isErr ? 'text-red-400' : isSucc ? 'text-emerald-500' : 'text-amber-400'}`}>
                                {e.resource_status}
                              </span>
                            </div>

                            {isErr && e.resource_status_reason && (
                              <div className="mt-2 text-xs bg-red-500/5 border border-red-500/10 text-red-300/80 p-3 rounded-lg leading-relaxed">
                                {e.resource_status_reason}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
          </div>
        )}

        {/* Tab: System Logs */}
        {activeTab === 'logs' && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm h-[70vh] min-h-[500px] flex flex-col">
            <div className="flex flex-wrap gap-2 mb-4">
              {['litestream_nginx', 'litestream_backend', 'litestream_worker', 'litestream_db', 'litestream_localstack'].map(container => (
                <button
                  key={container}
                  onClick={() => fetchLogs(container)}
                  className="bg-black border border-white/5 hover:border-purple-500/30 text-zinc-400 hover:text-white px-4 py-2 rounded-lg text-xs font-mono transition-all"
                >
                  {container.replace('litestream_', '')}
                </button>
              ))}
            </div>
            
            <div className="relative flex-1 bg-[#050505] rounded-xl border border-white/5 overflow-hidden flex flex-col group">
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed custom-scrollbar">
                {renderColorizedLogs()}
                <div ref={logsEndRef} />
              </div>
              <button 
                onClick={() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="absolute bottom-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                title="Scroll to bottom"
              >
                <ArrowDown className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
