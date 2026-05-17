import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap, User, Lock, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setError("");
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        setLoading(true);
        try {
            await register(username, password);
            navigate("/dashboard");
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })
                ?.response?.data?.error;
            setError(
                msg ?? "Registration failed. Username may already be taken.",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-1 items-center justify-center px-4">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon-purple/[0.06] rounded-full blur-3xl" />
            </div>
            <div className="relative w-full max-w-md animate-fade-in">
                <div className="bg-surface-850/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-[0_32px_64px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center shadow-neon-purple">
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
                        Create your channel
                    </h1>
                    <p className="text-sm text-neutral-500 text-center mb-7">
                        Your permanent stream key is generated automatically.
                    </p>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <User
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <input
                                id="reg-username"
                                type="text"
                                placeholder="Username (3–32 chars)"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                maxLength={32}
                                className="w-full bg-surface-800/70 border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-purple/40 transition-all duration-200"
                            />
                        </div>
                        <div className="relative">
                            <Lock
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <input
                                id="reg-password"
                                type="password"
                                placeholder="Password (min 6 chars)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-surface-800/70 border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-purple/40 transition-all duration-200"
                            />
                        </div>
                        <div className="relative">
                            <Lock
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none"
                            />
                            <input
                                id="reg-confirm"
                                type="password"
                                placeholder="Confirm password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                                className="w-full bg-surface-800/70 border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-purple/40 transition-all duration-200"
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-slide-up">
                                <AlertCircle size={14} className="shrink-0" />
                                {error}
                            </div>
                        )}
                        <button
                            type="submit"
                            id="reg-submit"
                            disabled={loading}
                            className="w-full py-3 rounded-xl bg-neon-purple text-white font-bold text-sm shadow-neon-purple hover:shadow-[0_0_30px_rgba(145,70,255,0.4)] hover:scale-[1.02] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {loading && (
                                <Loader2 size={16} className="animate-spin" />
                            )}
                            {loading ? "Creating account…" : "Create Account"}
                        </button>
                    </form>
                    <p className="text-sm text-neutral-500 text-center mt-6">
                        Already a streamer?{" "}
                        <Link
                            to="/login"
                            className="text-neon-green hover:underline font-semibold">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
