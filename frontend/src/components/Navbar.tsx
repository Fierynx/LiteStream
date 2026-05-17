import { Link, useNavigate } from "react-router-dom";
import { Zap, Search, Bell, LayoutDashboard, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
    const navigate = useNavigate();
    const { user, isLoading } = useAuth();

    return (
        <nav className="h-14 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-5 shrink-0 z-50">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center shadow-neon-green group-hover:shadow-[0_0_20px_rgba(57,255,20,0.5)] transition-all duration-300">
                    <Zap
                        size={18}
                        className="text-surface-950"
                        strokeWidth={2.5}
                    />
                </div>
                <span className="text-lg font-bold tracking-tight">
                    Lite<span className="text-neon-green">Stream</span>
                </span>
            </Link>

            {/* Center search */}
            <div className="hidden md:flex items-center gap-2 bg-surface-800/60 border border-white/[0.06] rounded-lg px-3 py-1.5 w-64 focus-within:border-neon-green/30 transition-all duration-200">
                <Search size={14} className="text-neutral-500 shrink-0" />
                <input
                    type="text"
                    placeholder="Search streams…"
                    className="bg-transparent text-sm text-neutral-300 placeholder-neutral-600 outline-none w-full"
                />
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate("/")}
                    className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors duration-200">
                    Browse
                </button>

                <button className="relative p-1.5 text-neutral-500 hover:text-neutral-200 transition-colors duration-200">
                    <Bell size={18} />
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-neon-green" />
                </button>

                {/* Auth state */}
                {!isLoading &&
                    (user ? (
                        /* Authenticated: show avatar + dashboard link */
                        <Link
                            to="/dashboard"
                            className="flex items-center gap-2 group"
                            title="Creator Dashboard">
                            <div className="relative">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-purple to-neon-pink ring-2 ring-neon-purple/30 group-hover:ring-neon-purple/60 transition-all duration-200 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white uppercase">
                                        {user.username.charAt(0)}
                                    </span>
                                </div>
                            </div>
                            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-700/50 border border-white/[0.06] hover:bg-surface-600/50 transition-all duration-200">
                                <LayoutDashboard
                                    size={13}
                                    className="text-neon-green"
                                />
                                <span className="text-xs font-semibold text-neutral-300">
                                    {user.username}
                                </span>
                            </div>
                        </Link>
                    ) : (
                        /* Unauthenticated: show Sign In button */
                        <Link
                            to="/login"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neon-green text-surface-950 text-sm font-bold hover:shadow-neon-green hover:scale-[1.03] transition-all duration-200">
                            <LogIn size={14} />
                            Sign In
                        </Link>
                    ))}
            </div>
        </nav>
    );
}
