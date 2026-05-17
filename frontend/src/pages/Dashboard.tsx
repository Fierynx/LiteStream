import { useState, useEffect, useRef } from "react";
import { Navigate, Link } from "react-router-dom";
import axios from "axios";
import {
    Zap,
    Key,
    Eye,
    EyeOff,
    Copy,
    Check,
    Edit3,
    Save,
    Radio,
    Film,
    ExternalLink,
    LogOut,
    Loader2,
    UploadCloud,
    X,
    ImageIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API = "http://localhost:8000";

/* ─── Drag-and-drop thumbnail upload zone ─── */
interface UploadZoneProps {
    currentUrl: string;
    onUploaded: (url: string) => void;
    token: string;
}

function ThumbnailUploadZone({
    currentUrl,
    onUploaded,
    token,
}: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState<string>(currentUrl);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    // Sync preview when parent's currentUrl changes (on fetch).
    useEffect(() => {
        setPreview(currentUrl);
    }, [currentUrl]);

    const upload = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            setError("Only image files are accepted.");
            return;
        }
        // Show local preview immediately for instant feedback.
        const localUrl = URL.createObjectURL(file);
        setPreview(localUrl);
        setError("");
        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const { data } = await axios.post<{ url: string }>(
                `${API}/upload/thumbnail`,
                form,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                },
            );
            setPreview(data.url);
            onUploaded(data.url);
            setDone(true);
            setTimeout(() => setDone(false), 3000);
        } catch {
            setError("Upload failed. Is the backend running?");
            setPreview(currentUrl); // revert
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) upload(file);
    };

    const clear = () => {
        setPreview("");
        onUploaded("");
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div>
            <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold mb-1.5">
                Thumbnail Image
            </p>

            {/* Drop / click zone */}
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`relative group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden
                    ${
                        dragging
                            ? "border-neon-cyan/60 bg-neon-cyan/[0.04] scale-[1.01]"
                            : "border-white/[0.08] hover:border-neon-cyan/30 hover:bg-white/[0.01]"
                    }`}
                style={{ minHeight: "10rem" }}>
                {preview ? (
                    /* Preview */
                    <div className="relative h-40 w-full">
                        <img
                            src={preview}
                            alt="thumbnail preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                    "none";
                            }}
                        />
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                            <UploadCloud size={20} className="text-white" />
                            <span className="text-white text-sm font-bold">
                                Replace
                            </span>
                        </div>
                        {/* Clear button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                clear();
                            }}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500/80 transition-all duration-200">
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    /* Empty state */
                    <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-surface-700/60 border border-white/[0.06] flex items-center justify-center group-hover:border-neon-cyan/20 transition-all duration-200">
                            {uploading ? (
                                <Loader2
                                    size={22}
                                    className="text-neon-cyan animate-spin"
                                />
                            ) : (
                                <ImageIcon
                                    size={22}
                                    className="text-neutral-600 group-hover:text-neon-cyan/60 transition-colors duration-200"
                                />
                            )}
                        </div>
                        <div>
                            <p className="text-sm text-neutral-400 font-semibold">
                                {dragging
                                    ? "Drop to upload"
                                    : "Click or drag an image here"}
                            </p>
                            <p className="text-xs text-neutral-600 mt-0.5">
                                PNG, JPG, WebP · max 10 MB
                            </p>
                        </div>
                    </div>
                )}

                {/* Uploading spinner overlay */}
                {uploading && (
                    <div className="absolute inset-0 bg-surface-900/70 flex items-center justify-center">
                        <div className="flex items-center gap-2 text-neon-cyan text-sm font-bold">
                            <Loader2 size={18} className="animate-spin" />
                            Uploading…
                        </div>
                    </div>
                )}
            </div>

            {/* Status messages */}
            {done && !uploading && (
                <p className="text-xs text-neon-green mt-1.5 flex items-center gap-1">
                    <Check size={11} /> Thumbnail saved to S3
                </p>
            )}
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            {!done && !error && (
                <p className="text-[11px] text-neutral-600 mt-1.5 ml-0.5">
                    Uploads directly to LocalStack S3. Appears as the card
                    thumbnail on Browse.
                </p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleChange}
            />
        </div>
    );
}

/* ─── Dashboard ─── */
export default function Dashboard() {
    const { user, token, logout } = useAuth();

    const [keyVisible, setKeyVisible] = useState(false);
    const [copied, setCopied] = useState(false);

    const [title, setTitle] = useState("");
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);

    const [streamStatus, setStreamStatus] = useState<
        "offline" | "live" | "vod"
    >("offline");

    if (!user) return <Navigate to="/login" replace />;

    // Fetch current channel info on mount.
    useEffect(() => {
        if (!user) return;
        axios
            .get<{
                data: { title: string; thumbnail_url: string; status: string };
            }>(`${API}/channel/${user.username}`)
            .then(({ data }) => {
                setTitle(data.data.title ?? "");
                setThumbnailUrl(data.data.thumbnail_url ?? "");
                setStreamStatus(data.data.status as "offline" | "live" | "vod");
            })
            .catch(() => {});
    }, [user]);

    // Poll stream status every 5 s.
    useEffect(() => {
        if (!user) return;
        const iv = setInterval(() => {
            axios
                .get<{ data: { status: string } }>(
                    `${API}/channel/${user.username}`,
                )
                .then(({ data }) =>
                    setStreamStatus(
                        data.data.status as "offline" | "live" | "vod",
                    ),
                )
                .catch(() => {});
        }, 5000);
        return () => clearInterval(iv);
    }, [user]);

    const copyKey = () => {
        if (!user) return;
        navigator.clipboard.writeText(user.streamKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const saveSettings = async () => {
        if (!token) return;
        setSettingsSaving(true);
        try {
            await axios.patch(
                `${API}/stream/settings`,
                { title, thumbnail_url: thumbnailUrl },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            setSettingsSaved(true);
            setSettingsDirty(false);
            setTimeout(() => setSettingsSaved(false), 2500);
        } catch {
            /* ignore */
        } finally {
            setSettingsSaving(false);
        }
    };

    const statusBadge = {
        live: {
            label: "LIVE",
            cls: "bg-red-500/10 border-red-500/30 text-red-400",
        },
        vod: {
            label: "VOD",
            cls: "bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan",
        },
        offline: {
            label: "OFFLINE",
            cls: "bg-surface-700/60 border-white/[0.06] text-neutral-500",
        },
    }[streamStatus];

    return (
        <div className="flex flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-3xl w-full mx-auto px-5 py-8 space-y-6 animate-fade-in">
                {/* ── Header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-neutral-100">
                            Creator Dashboard
                        </h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
                            Welcome back,{" "}
                            <span className="text-neon-green font-semibold">
                                {user.username}
                            </span>
                        </p>
                    </div>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-700/50 border border-white/[0.06] text-neutral-400 hover:text-red-400 hover:border-red-500/20 text-sm transition-all duration-200">
                        <LogOut size={14} />
                        Sign out
                    </button>
                </div>

                {/* ── Status Card ── */}
                <div className="bg-surface-850/80 backdrop-blur-sm border border-white/[0.04] rounded-2xl p-6">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-neutral-600 font-bold mb-1">
                                Channel Status
                            </p>
                            <div className="flex items-center gap-2">
                                {streamStatus === "live" && (
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                )}
                                <span
                                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadge.cls}`}>
                                    {statusBadge.label}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {streamStatus === "live" && (
                                <Link
                                    to={`/live/${user.username}`}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-600/20 transition-all duration-200">
                                    <Radio size={13} />
                                    View Live
                                    <ExternalLink size={11} />
                                </Link>
                            )}
                            {streamStatus === "vod" && (
                                <Link
                                    to={`/vod/${user.streamKey}`}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-sm font-bold hover:bg-neon-cyan/20 transition-all duration-200">
                                    <Film size={13} />
                                    Watch VOD
                                    <ExternalLink size={11} />
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── OBS Setup ── */}
                <div className="bg-surface-850/80 backdrop-blur-sm border border-white/[0.04] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-neon-green/10 border border-neon-green/20 flex items-center justify-center">
                            <Key size={14} className="text-neon-green" />
                        </div>
                        <h2 className="font-bold text-neutral-200">
                            OBS / Stream Setup
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {/* RTMP URL */}
                        <div>
                            <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold mb-1.5">
                                RTMP Server
                            </p>
                            <div className="flex items-center gap-2 bg-surface-800/60 border border-white/[0.04] rounded-xl px-4 py-2.5">
                                <code className="text-sm text-neutral-300 font-mono flex-1">
                                    rtmp://localhost/live
                                </code>
                            </div>
                        </div>

                        {/* Stream Key */}
                        <div>
                            <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold mb-1.5">
                                Stream Key
                            </p>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 bg-surface-800/60 border border-white/[0.04] rounded-xl px-4 py-2.5 flex-1">
                                    <Zap
                                        size={13}
                                        className="text-neon-green shrink-0"
                                    />
                                    <code className="text-sm font-mono flex-1 text-neutral-300 select-all">
                                        {keyVisible
                                            ? user.streamKey
                                            : "live_" + "•".repeat(28)}
                                    </code>
                                </div>
                                <button
                                    id="toggle-key"
                                    onClick={() => setKeyVisible((v) => !v)}
                                    title={keyVisible ? "Hide" : "Reveal"}
                                    className="p-2.5 rounded-xl bg-surface-700/50 border border-white/[0.06] text-neutral-400 hover:text-neutral-200 transition-all duration-200">
                                    {keyVisible ? (
                                        <EyeOff size={16} />
                                    ) : (
                                        <Eye size={16} />
                                    )}
                                </button>
                                <button
                                    id="copy-key"
                                    onClick={copyKey}
                                    title="Copy to clipboard"
                                    className="p-2.5 rounded-xl bg-surface-700/50 border border-white/[0.06] text-neutral-400 hover:text-neon-green hover:border-neon-green/20 transition-all duration-200">
                                    {copied ? (
                                        <Check
                                            size={16}
                                            className="text-neon-green"
                                        />
                                    ) : (
                                        <Copy size={16} />
                                    )}
                                </button>
                            </div>
                            <p className="text-[11px] text-neutral-600 mt-1.5 ml-1">
                                🔒 Keep this private. NGINX will reject any OBS
                                connection that uses an unknown key.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Channel Settings ── */}
                <div className="bg-surface-850/80 backdrop-blur-sm border border-white/[0.04] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                                <Edit3 size={14} className="text-neon-cyan" />
                            </div>
                            <h2 className="font-bold text-neutral-200">
                                Channel Settings
                            </h2>
                        </div>
                        <button
                            id="save-settings"
                            onClick={saveSettings}
                            disabled={!settingsDirty || settingsSaving}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan text-sm font-bold hover:bg-neon-cyan/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
                            {settingsSaving ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : settingsSaved ? (
                                <Check size={14} />
                            ) : (
                                <Save size={14} />
                            )}
                            {settingsSaved ? "Saved!" : "Save Changes"}
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* Stream Title */}
                        <div>
                            <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold mb-1.5">
                                Stream Title
                            </p>
                            <input
                                id="stream-title"
                                type="text"
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    setSettingsDirty(true);
                                }}
                                placeholder="Enter your stream title…"
                                className="w-full bg-surface-800/60 border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-neon-cyan/40 focus:shadow-[0_0_12px_rgba(0,229,255,0.06)] transition-all duration-200"
                            />
                        </div>

                        {/* Thumbnail Upload */}
                        <ThumbnailUploadZone
                            currentUrl={thumbnailUrl}
                            token={token ?? ""}
                            onUploaded={(url) => {
                                setThumbnailUrl(url);
                                setSettingsDirty(true);
                            }}
                        />

                        <p className="text-xs text-neutral-600">
                            Public channel URL:{" "}
                            <Link
                                to={`/live/${user.username}`}
                                className="text-neon-green hover:underline font-mono">
                                /live/{user.username}
                            </Link>
                        </p>
                    </div>
                </div>

                {/* ── Quick Start ── */}
                <div className="bg-surface-800/40 border border-white/[0.04] rounded-2xl p-5">
                    <p className="text-xs text-neutral-600 uppercase tracking-widest font-bold mb-3">
                        Quick Start
                    </p>
                    <ol className="space-y-2 text-sm text-neutral-400">
                        <li className="flex gap-2">
                            <span className="text-neon-green font-bold">
                                1.
                            </span>{" "}
                            Open OBS → Settings → Stream
                        </li>
                        <li className="flex gap-2">
                            <span className="text-neon-green font-bold">
                                2.
                            </span>{" "}
                            Set{" "}
                            <strong className="text-neutral-300">
                                Service
                            </strong>{" "}
                            to <code className="text-neon-cyan">Custom</code>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-neon-green font-bold">
                                3.
                            </span>{" "}
                            Set{" "}
                            <strong className="text-neutral-300">Server</strong>{" "}
                            to{" "}
                            <code className="text-neon-cyan">
                                rtmp://localhost/live
                            </code>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-neon-green font-bold">
                                4.
                            </span>{" "}
                            Paste your Stream Key above into the{" "}
                            <strong className="text-neutral-300">
                                Stream Key
                            </strong>{" "}
                            field
                        </li>
                        <li className="flex gap-2">
                            <span className="text-neon-green font-bold">
                                5.
                            </span>{" "}
                            Click{" "}
                            <strong className="text-neutral-300">
                                Start Streaming
                            </strong>{" "}
                            — your channel goes live automatically!
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
