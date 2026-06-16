import React from 'react';
import { useLocation } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import { ServerCrash, Loader2 } from 'lucide-react';

interface InfraGuardProps {
    children: React.ReactNode;
}

export const InfraGuard: React.FC<InfraGuardProps> = ({ children }) => {
    const location = useLocation();
    const { config, loading } = useConfig();

    // Allow access to admin pages regardless of infrastructure status
    if (location.pathname.startsWith('/admin')) {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-surface-950">
                <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
            </div>
        );
    }

    // Check if the essential infrastructure is missing
    const isInfraMissing = !config.PUBLIC_VOD_BASE_URL;

    if (isInfraMissing) {
        return (
            <div className="flex flex-col items-center justify-center h-screen w-screen bg-surface-950 relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-neon-green/5 blur-[120px] rounded-full mix-blend-screen" />
                    <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-surface-800/50 blur-[120px] rounded-full mix-blend-screen" />
                </div>

                {/* Glassmorphism card */}
                <div className="relative z-10 flex flex-col items-center max-w-lg w-full px-8 py-12 text-center bg-surface-900/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl mx-4">
                    <div className="flex items-center justify-center w-20 h-20 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                        <ServerCrash size={40} strokeWidth={1.5} />
                    </div>
                    
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-100 mb-3">
                        System Offline
                    </h1>
                    
                    <p className="text-neutral-400 leading-relaxed mb-8">
                        The LiteStream AWS infrastructure is currently deprovisioned. Core services like video streaming, VOD processing, and storage are unavailable.
                    </p>

                    <div className="flex w-full">
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full flex items-center justify-center gap-2 bg-neon-green/10 text-neon-green font-semibold py-3.5 px-6 rounded-xl hover:bg-neon-green/20 border border-neon-green/20 transition-all duration-200 active:scale-95"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

export default InfraGuard;
