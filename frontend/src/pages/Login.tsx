import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap, User, Lock, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(username, password);
            navigate("/dashboard");
        } catch {
            setError("Invalid username or password.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-1 items-center justify-center px-4">
            {/* Ambient glow */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-green/[0.06] rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-neon-purple/[0.04] rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md animate-fade-in">
                {/* Card */}
                <div className="bg-surface-850/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center shadow-neon-green">
                            <Zap
                                size={20}
                                className="text-surface-950"
                                strokeWidth={2.5}
                            />
                        </div>
                        <span className="text-2xl font-bold tracking-tight">
                            Lite<span className="text-neon-green">Stream</span>
                        </span>
                    </div>

                    <h1 className="text-xl font-bold text-center text-neutral-100 mb-1">
                        Welcome back
                    </h1>
                    <p className="text-sm text-neutral-500 text-center mb-7">
                        Sign in to your creator account
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Username */}
                        <div className="relative">
                            <User
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <input
                                id="login-username"
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                                className="w-full bg-surface-800/70 border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-green/40 focus:shadow-[0_0_15px_rgba(57,255,20,0.06)] transition-all duration-200"
                            />
                        </div>

                        {/* Password */}
                        <div className="relative">
                            <Lock
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <input
                                id="login-password"
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="w-full bg-surface-800/70 border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-green/40 focus:shadow-[0_0_15px_rgba(57,255,20,0.06)] transition-all duration-200"
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-slide-up">
                                <AlertCircle size={14} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            id="login-submit"
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-neon-green text-surface-950 font-bold text-sm shadow-neon-green hover:shadow-[0_0_30px_rgba(57,255,20,0.4)] hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2">
                            {loading && (
                                <Loader2 size={16} className="animate-spin" />
                            )}
                            {loading ? "Signing in…" : "Sign In"}
                        </button>
                    </form>

                    <p className="text-sm text-neutral-500 text-center mt-6">
                        No account?{" "}
                        <Link
                            to="/register"
                            className="text-neon-green hover:underline font-semibold">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
