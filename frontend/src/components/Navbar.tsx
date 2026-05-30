import { Link, useNavigate } from "react-router-dom";
import { Zap, Search, Bell, LogIn } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
    const navigate = useNavigate();
    const { user, isLoading, logout } = useAuth();

    return (
        <nav className="h-14 bg-surface-950/90 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-5 shrink-0 z-50">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
                <div className="w-7 h-7 rounded bg-brand-primary flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <Zap
                        size={16}
                        className="text-surface-950"
                        strokeWidth={2.5}
                        fill="currentColor"
                    />
                </div>
                <span className="text-lg font-bold tracking-tight text-white group-hover:text-neutral-200 transition-colors">
                    LiteStream
                </span>
            </Link>

            {/* Center search */}
            <div className="hidden md:flex items-center gap-2 bg-surface-900 border border-white/[0.06] hover:border-white/10 rounded-md px-3 py-1.5 w-72 focus-within:border-brand-primary/50 focus-within:ring-1 focus-within:ring-brand-primary/20 transition-all duration-200">
                <Search size={14} className="text-neutral-500 shrink-0" />
                <input
                    type="text"
                    placeholder="Search..."
                    className="bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none w-full"
                />
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate("/")}
                    className="text-sm font-semibold text-neutral-400 hover:text-white transition-colors duration-200">
                    Browse
                </button>

                <button className="relative p-1 text-neutral-400 hover:text-white transition-colors duration-200">
                    <Bell size={18} />
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-brand-primary border-2 border-surface-950" />
                </button>

                {/* Auth state */}
                {!isLoading &&
                    (user ? (
                        /* Authenticated */
                        <div className="flex items-center gap-4 ml-2">
                            <Link to="/studio" className="text-sm font-semibold text-neutral-300 hover:text-white transition-colors duration-200">
                                Video Studio
                            </Link>
                            <Link
                                to="/dashboard"
                                className="flex items-center gap-2 group"
                                title="Stream Manager">
                                <div className="w-8 h-8 rounded-full bg-surface-800 border border-white/10 group-hover:border-white/20 transition-all duration-200 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white uppercase">
                                        {user.username.charAt(0)}
                                    </span>
                                </div>
                            </Link>
                            <button
                                onClick={() => {
                                    logout();
                                    navigate("/");
                                }}
                                className="ml-2 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors duration-200"
                                title="Logout">
                                Logout
                            </button>
                        </div>
                    ) : (
                        /* Unauthenticated */
                        <Link
                            to="/login"
                            className="ml-2 flex items-center gap-2 px-3 py-1.5 rounded bg-white text-black text-sm font-bold hover:bg-neutral-200 transition-colors duration-200">
                            <LogIn size={14} />
                            Log In
                        </Link>
                    ))}
            </div>
        </nav>
    );
}
