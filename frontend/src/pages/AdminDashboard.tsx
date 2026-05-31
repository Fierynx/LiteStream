import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, Activity, Terminal, AlertTriangle, 
  Loader2, LogOut, ShieldAlert, Key, ArrowDown,
  Eye, EyeOff
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { 
  useAdminLogin, useInfraStatus, useInfraEvents, 
  useAwsConfig, useSaveAwsConfig, useProvisionInfra, useDeprovisionInfra,
  useInfraMetrics
} from '../hooks/useAdminApi';

interface AwsConfigForm {
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_region: string;
  aws_endpoint: string;
}

export const AdminDashboard: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  
  const [logs, setLogs] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'infra' | 'logs' | 'aws' | 'monitoring'>('monitoring');
  const [showSecret, setShowSecret] = useState(false);
  
  // UX States
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [showDestroyModal, setShowDestroyModal] = useState(false);
  const [destroyInput, setDestroyInput] = useState('');
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Login Mutation
  const { mutate: login, isPending: loginLoading } = useAdminLogin();
  const { register: registerLogin, handleSubmit: handleLoginSubmit } = useForm();

  const onLogin = (data: Record<string, unknown>) => {
    login(data.password as string, {
      onSuccess: (res) => {
        localStorage.setItem('adminToken', res.token);
        setToken(res.token);
      },
      onError: () => showToast('Invalid credentials', 'error'),
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
  };

  // Infrastructure API
  const { data: statusData } = useInfraStatus(token ?? '');
  const infraStatus = statusData?.status || 'UNKNOWN';

  const { data: events = [] } = useInfraEvents(token ?? '');
  const { data: metrics, isLoading: isMetricsLoading } = useInfraMetrics(token ?? '');

  const { mutate: provision, isPending: provisionLoading } = useProvisionInfra();
  const { mutate: deprovision, isPending: deprovisionLoading } = useDeprovisionInfra();

  // AWS Config API
  const { data: awsData } = useAwsConfig(token ?? '');
  const { mutate: saveAwsConfig, isPending: awsSaving } = useSaveAwsConfig();
  
  const { register: registerAws, handleSubmit: handleAwsSubmit, reset: resetAwsForm } = useForm<AwsConfigForm>();

  useEffect(() => {
    if (awsData) {
      resetAwsForm({
        aws_access_key_id: awsData.aws_access_key_id || '',
        aws_region: awsData.aws_region || 'us-east-1',
        aws_endpoint: awsData.aws_endpoint || '',
        aws_secret_access_key: awsData.aws_secret_access_key || '',
      });
    }
  }, [awsData, resetAwsForm]);

  const onSaveAwsConfig = (data: AwsConfigForm) => {
    if (!token) return;
    saveAwsConfig(
      { token, config: data },
      {
        onSuccess: () => {
          showToast('AWS configuration updated', 'success');
        },
        onError: () => {
          showToast('Failed to update AWS config', 'error');
        },
      }
    );
  };

  const handleProvision = async () => {
    if (!token) return;
    provision(token, {
      onSuccess: () => showToast('Provisioning started', 'success'),
      onError: () => showToast('Provisioning failed', 'error'),
    });
  };

  const handleDestroy = async () => {
    if (!token) return;
    if (destroyInput !== 'DESTROY') return;
    
    deprovision(token, {
      onSuccess: () => {
        showToast('Destruction initiated', 'success');
        setShowDestroyModal(false);
        setDestroyInput('');
      },
      onError: () => showToast('Destruction failed', 'error'),
    });
  };

  useEffect(() => {
  }, [events]);

  const fetchLogs = async (container: string) => {
    setLogs('Fetching...');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/admin/logs/${container}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.text());
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        setLogs('Failed to fetch logs');
      }
    } catch {
      setLogs('Connection error');
    }
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

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
          <form onSubmit={handleLoginSubmit(onLogin)} className="space-y-5">
            <input
              type="password"
              placeholder="Password"
              {...registerLogin("password", { required: true })}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-zinc-600"
            />
            <button type="submit" disabled={loginLoading} className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-all active:scale-95 shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              {loginLoading ? 'Authenticating...' : 'Authenticate'}
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
                onClick={handleDestroy}
                disabled={destroyInput !== 'DESTROY' || deprovisionLoading}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 py-3 rounded-lg text-sm font-medium transition-colors"
              >
                {deprovisionLoading ? 'Deleting...' : 'Confirm Delete'}
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
            <button onClick={() => setActiveTab('aws')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'aws' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <Key className="w-4 h-4 mr-2" /> AWS Config
            </button>
            <button onClick={() => setActiveTab('monitoring')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'monitoring' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <Activity className="w-4 h-4 mr-2" /> Monitoring
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-2"></div>
            <button onClick={handleLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab: AWS Settings */}
        {activeTab === 'aws' && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 lg:p-10 backdrop-blur-sm shadow-xl flex-1 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
              <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center border border-orange-500/20">
                <Server className="text-orange-500 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">AWS Configuration</h2>
              </div>
            </div>

            <form onSubmit={handleAwsSubmit(onSaveAwsConfig)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Access Key ID</label>
                  <input 
                    type="text"
                    {...registerAws("aws_access_key_id")}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 outline-none transition-all font-mono text-sm"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Secret Access Key</label>
                  <div className="relative">
                    <input 
                      type={showSecret ? "text" : "password"}
                      {...registerAws("aws_secret_access_key")}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 outline-none transition-all font-mono text-sm"
                      placeholder="Leave blank to keep existing"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">AWS Region</label>
                  <input 
                    type="text"
                    {...registerAws("aws_region", { required: true })}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 outline-none transition-all font-mono text-sm"
                    placeholder="us-east-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Custom Endpoint</label>
                  <input 
                    type="text"
                    {...registerAws("aws_endpoint")}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 outline-none transition-all font-mono text-sm"
                    placeholder="http://localstack:4566 (Optional)"
                  />
                </div>
              </div>

              {/* Provisioned Endpoints Section */}
              <div className="mt-8 pt-8 border-t border-white/10">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-purple-400" />
                  Provisioned Endpoints
                </h3>
                <div className="space-y-4">
                  {[
                    { label: 'Public VOD Base URL', value: awsData?.public_vod_base_url || 'Not provisioned' },
                    { label: 'S3 Bucket Name', value: awsData?.s3_bucket_name || 'Not provisioned' },
                    { label: 'SQS Queue URL', value: awsData?.sqs_queue_url || 'Not provisioned' },
                    { label: 'RTMP Ingest URL', value: awsData?.rtmp_ingest_url || 'Not provisioned' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="sm:w-1/3 text-xs font-bold text-neutral-400 uppercase tracking-wider">{item.label}</div>
                      <input 
                        type="text"
                        disabled
                        value={item.value}
                        className="flex-1 bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-neutral-300 font-mono text-sm cursor-not-allowed opacity-70"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-zinc-800/50">
                <button 
                  type="submit" 
                  disabled={awsSaving}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.2)]"
                >
                  {awsSaving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Save & Sync Credentials"}
                </button>
              </div>
            </form>
          </div>
        )}

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
                  <button onClick={handleProvision} disabled={provisionLoading || inProgress} className="w-full group relative flex items-center justify-center bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-semibold py-3 px-4 rounded-xl transition-all">
                    {provisionLoading && !inProgress ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Deploy Infrastructure
                  </button>
                  <button onClick={() => setShowDestroyModal(true)} disabled={deprovisionLoading || inProgress || infraStatus === 'DOES_NOT_EXIST'} className="w-full flex items-center justify-center bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-30 font-medium py-3 px-4 rounded-xl transition-all">
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
                      {events.map((e: Record<string, string>, idx: number) => {
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

        {/* Tab: Monitoring */}
        {activeTab === 'monitoring' && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 lg:p-10 backdrop-blur-sm shadow-xl flex-1 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                  <Activity className="text-blue-500 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Usage Monitoring</h2>
                  <p className="text-xs text-zinc-400 mt-1">Track your AWS Free Tier consumption</p>
                </div>
              </div>
              {isMetricsLoading && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
            </div>

            <div className="space-y-8">
              {/* CloudFront Data Transfer */}
              <div className="bg-black/30 border border-white/5 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">CloudFront Data Transfer Out</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Rolling 30 days data transfer limit</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-white">
                      {((metrics?.cloudfront_bytes_30d || 0) / (1024 ** 3)).toFixed(2)} GB
                    </span>
                    <span className="text-xs text-zinc-500 ml-1">/ 1,024 GB (1 TB)</span>
                  </div>
                </div>
                
                <div className="w-full bg-zinc-800 rounded-full h-3 mb-2 overflow-hidden">
                  <div 
                    className={`h-3 rounded-full transition-all duration-1000 ${
                      ((metrics?.cloudfront_bytes_30d || 0) / (1024 ** 4)) > 0.85 ? 'bg-red-500' : 'bg-blue-500'
                    }`} 
                    style={{ width: `${Math.min(((metrics?.cloudfront_bytes_30d || 0) / (1024 ** 4)) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>0%</span>
                  <span>Free Tier Limit: 100%</span>
                </div>
              </div>

              {/* S3 Storage */}
              <div className="bg-black/30 border border-white/5 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">S3 Standard Storage</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Current stored video assets</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-white">
                      {((metrics?.s3_bytes_current || 0) / (1024 ** 3)).toFixed(2)} GB
                    </span>
                    <span className="text-xs text-zinc-500 ml-1">/ 5.00 GB</span>
                  </div>
                </div>
                
                <div className="w-full bg-zinc-800 rounded-full h-3 mb-2 overflow-hidden">
                  <div 
                    className={`h-3 rounded-full transition-all duration-1000 ${
                      ((metrics?.s3_bytes_current || 0) / (5 * 1024 ** 3)) > 0.85 ? 'bg-red-500' : 'bg-emerald-500'
                    }`} 
                    style={{ width: `${Math.min(((metrics?.s3_bytes_current || 0) / (5 * 1024 ** 3)) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>0%</span>
                  <span>Free Tier Limit: 100%</span>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200/80 leading-relaxed">
                  <strong>Note:</strong> These metrics are pulled directly from AWS CloudWatch without incurring any costs. However, to guarantee absolutely no unexpected charges, please ensure you have set up a <strong>Billing Alarm</strong> in your AWS Billing Console.
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
