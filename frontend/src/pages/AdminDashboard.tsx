import React, { useState, useEffect } from 'react';

export const AdminDashboard: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logs, setLogs] = useState<string>('');
  const [infraStatus, setInfraStatus] = useState<string>('UNKNOWN');
  const [activeTab, setActiveTab] = useState<'logs' | 'infra'>('infra');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (token) {
      checkInfraStatus();
    }
  }, [token]);

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
        alert('Invalid admin credentials');
      }
    } catch (err) {
      console.error(err);
      alert('Login failed');
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
    setLogs('Fetching logs...');
    try {
      const res = await fetch(`${API_URL}/admin/logs/${container}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const text = await res.text();
        setLogs(text);
      } else {
        setLogs('Failed to fetch logs');
      }
    } catch (err) {
      setLogs('Error connecting to backend');
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
        alert('Provisioning started!');
        checkInfraStatus();
      } else {
        alert('Failed to provision');
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const deprovisionInfra = async () => {
    if (!confirm('Are you sure you want to destroy all AWS resources?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/infra/deprovision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Deprovisioning started!');
        checkInfraStatus();
      } else {
        alert('Failed to deprovision');
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <div className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-bold mb-6 text-center text-purple-400">Admin Portal</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Admin Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-800 rounded p-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 rounded p-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded transition-colors"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            LiteStream Command Center
          </h1>
          <button onClick={handleLogout} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-sm font-semibold transition-colors">
            Logout
          </button>
        </div>

        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('infra')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'infra' ? 'bg-purple-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            Infrastructure (AWS)
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-2 rounded-full font-semibold transition-colors ${activeTab === 'logs' ? 'bg-purple-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            System Logs
          </button>
        </div>

        {activeTab === 'infra' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-lg">
            <h2 className="text-xl font-bold mb-4">CloudFormation Status</h2>
            <div className="flex items-center space-x-4 mb-8">
              <span className="text-zinc-400">Current State:</span>
              <span className={`px-3 py-1 rounded text-sm font-mono font-bold ${infraStatus === 'DOES_NOT_EXIST' || infraStatus.includes('DELETE') ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                {infraStatus}
              </span>
              <button onClick={checkInfraStatus} className="text-purple-400 hover:text-purple-300 text-sm underline">
                Refresh
              </button>
              <button onClick={fetchEvents} className="text-blue-400 hover:text-blue-300 text-sm underline">
                View Stack Events
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700/50 hover:border-purple-500/50 transition-colors">
                <h3 className="font-bold mb-2">Provision Infrastructure</h3>
                <p className="text-sm text-zinc-400 mb-6">Deploys S3 Bucket, SQS Queue, and CloudFront CDN.</p>
                <button
                  onClick={provisionInfra}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Deploy Now'}
                </button>
              </div>

              <div className="bg-zinc-800/50 p-6 rounded-lg border border-zinc-700/50 hover:border-red-500/50 transition-colors">
                <h3 className="font-bold mb-2">Deprovision Infrastructure</h3>
                <p className="text-sm text-zinc-400 mb-6">Destroys all AWS resources to save costs.</p>
                <button
                  onClick={deprovisionInfra}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Destroy All'}
                </button>
              </div>
            </div>

            {events.length > 0 && (
              <div className="mt-8 border-t border-zinc-800 pt-6">
                <h3 className="font-bold mb-4 text-lg">Recent Stack Events</h3>
                <div className="bg-black rounded-lg border border-zinc-800 overflow-auto max-h-[500px]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Resource</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {events.map((e, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/50">
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono">{e.logical_resource_id}</td>
                          <td className="px-4 py-3 text-zinc-400">{e.resource_type}</td>
                          <td className={`px-4 py-3 font-bold ${e.resource_status.includes('FAILED') ? 'text-red-400' : e.resource_status.includes('COMPLETE') ? 'text-green-400' : 'text-yellow-400'}`}>
                            {e.resource_status}
                          </td>
                          <td className="px-4 py-3 text-red-300 max-w-md truncate" title={e.resource_status_reason}>{e.resource_status_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg h-[70vh] min-h-[400px] flex flex-col">
            <div className="flex space-x-2 mb-4">
              {['litestream_nginx', 'litestream_backend', 'litestream_worker', 'litestream_db', 'litestream_localstack'].map(container => (
                <button
                  key={container}
                  onClick={() => fetchLogs(container)}
                  className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-xs font-mono transition-colors"
                >
                  {container}
                </button>
              ))}
            </div>
            <div className="flex-1 bg-black rounded-lg p-4 overflow-auto border border-zinc-800 font-mono text-sm text-green-400 whitespace-pre-wrap break-all">
              {logs || 'Select a container to view logs...'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
