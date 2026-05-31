import { useState, useEffect, useRef } from "react";
import { Navigate, Link } from "react-router-dom";
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
    ExternalLink,
    Loader2,
    UploadCloud,
    X,
    ImageIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useConfig } from "../contexts/ConfigContext";
import { useChat } from "../hooks/useChat";
import { useChannel, useUpdateStreamSettings, useUploadThumbnail } from "../hooks/useStreams";
import VideoPlayer from "../components/VideoPlayer";
import ChatSidebar from "../components/ChatSidebar";


/* ─── Drag-and-drop thumbnail upload zone ─── */
interface UploadZoneProps {
    currentUrl: string;
    onUploaded: (url: string) => void;
    token: string;
}

export function ThumbnailUploadZone({
    currentUrl,
    onUploaded,
    token,
}: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState<string>(currentUrl);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    const { mutate: uploadThumbnail, isPending: uploading } = useUploadThumbnail();

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
        
        uploadThumbnail({ file, token }, {
            onSuccess: (data) => {
                setPreview(data.url);
                onUploaded(data.url);
                setDone(true);
                setTimeout(() => setDone(false), 3000);
            },
            onError: () => {
                setError("Upload failed. Is the backend running?");
                setPreview(currentUrl); // revert
            }
        });
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
    const { user, token, isLoading } = useAuth();
    const { showToast } = useToast();
    const { config } = useConfig();

    const [keyVisible, setKeyVisible] = useState(false);
    const [copied, setCopied] = useState(false);

    const [title, setTitle] = useState("");
    const [thumbnailUrl, setThumbnailUrl] = useState("");
    const [settingsDirty, setSettingsDirty] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);

    // Fetch current channel info on mount with polling every 5s for status.
    const { data: channelData } = useChannel(user?.username || "", true);
    
    useEffect(() => {
        if (channelData?.data) {
            // Only update local state if not dirty to prevent overwriting user input
            if (!settingsDirty) {
                setTitle(channelData.data.title ?? "");
                setThumbnailUrl(channelData.data.thumbnail_url ?? "");
            }
        }
    }, [channelData, settingsDirty]);

    const streamStatus = channelData?.data?.status || "offline";

    const { mutate: updateSettings, isPending: settingsSaving } = useUpdateStreamSettings();

    const { messages, connected, historyLoaded, sendMessage } = useChat(
        user?.streamKey ?? "",
        "", // no vodId needed for live chat in dashboard
        user?.username ?? "",
    );

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    const copyKey = () => {
        if (!user) return;
        navigator.clipboard.writeText(user.streamKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const saveSettings = () => {
        if (!token) return;
        updateSettings({ title, thumbnail_url: thumbnailUrl, token }, {
            onSuccess: () => {
                setSettingsSaved(true);
                setSettingsDirty(false);
                showToast("Stream info updated successfully!", "success");
                setTimeout(() => setSettingsSaved(false), 2500);
            },
            onError: () => {
                showToast("Failed to update stream info.", "error");
            }
        });
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-[#0A0A0B]">
            {/* Main Area: Stream Preview & Manager */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-8 lg:p-12">
                <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-white">Stream Manager</h1>
                            <p className="text-neutral-400 mt-2">Manage your stream, engage with chat, and monitor health.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${streamStatus === "live" ? "bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "bg-surface-800 text-neutral-500 border-white/10"}`}>
                                {streamStatus === "live" && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
                                {streamStatus === "live" ? "LIVE" : "OFFLINE"}
                            </span>
                        </div>
                    </div>

                    {/* Grid Layout */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        {/* Video Player & Settings (Left / Top 2 cols) */}
                        <div className="xl:col-span-2 space-y-8">
                            {/* Live Preview */}
                            <div className="bg-black border border-white/[0.06] rounded-2xl overflow-hidden aspect-video relative group shadow-2xl">
                                {streamStatus === "live" ? (
                                    <div className="w-full h-full pointer-events-none">
                                        <VideoPlayer src={`${import.meta.env.VITE_HLS_URL_PREFIX}${user.streamKey}.m3u8`} isLive={true} />
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-850 text-neutral-500">
                                        <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mb-4">
                                            <Radio size={24} className="opacity-50" />
                                        </div>
                                        <p className="font-bold text-neutral-300 text-lg">Stream is Offline</p>
                                        <p className="text-sm mt-2 text-center max-w-sm">Start streaming from OBS to see your live preview here.</p>
                                    </div>
                                )}
                                {/* Overlay "Live Preview" Badge */}
                                <div className="absolute top-4 left-4 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10 text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    Live Preview
                                </div>
                            </div>

                            {/* Stream Settings Widget */}
                            <div className="bg-surface-850/80 backdrop-blur-md border border-white/[0.04] rounded-2xl p-6 shadow-xl">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.04]">
                                    <h2 className="font-bold text-neutral-200 flex items-center gap-2">
                                        <Edit3 size={18} className="text-neon-cyan" /> Edit Stream Info
                                    </h2>
                                    <button
                                        onClick={saveSettings}
                                        disabled={!settingsDirty || settingsSaving}
                                        className="flex items-center gap-2 px-4 py-2 bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 font-bold rounded-xl text-sm hover:bg-neon-cyan/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                        {settingsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {settingsSaved ? "Saved!" : "Save Updates"}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-2 block">Stream Title</label>
                                            <textarea
                                                value={title}
                                                onChange={e => { setTitle(e.target.value); setSettingsDirty(true); }}
                                                className="w-full h-24 bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 outline-none resize-none transition-all"
                                                placeholder="What are we playing today?"
                                            />
                                        </div>
                                        <div className="bg-surface-800/40 border border-white/[0.04] rounded-xl p-4">
                                            <p className="text-xs text-neutral-400 mb-2">Public URL:</p>
                                            <Link to={`/live/${user.username}`} className="text-neon-green hover:underline font-mono text-sm break-all flex items-center gap-1">
                                                {import.meta.env.VITE_FRONTEND_URL}/live/{user.username} <ExternalLink size={12} />
                                            </Link>
                                        </div>
                                    </div>
                                    <div>
                                        <ThumbnailUploadZone currentUrl={thumbnailUrl} token={token ?? ""} onUploaded={(url) => { setThumbnailUrl(url); setSettingsDirty(true); }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stream Key & OBS Setup (Right / Bottom 1 col) */}
                        <div className="space-y-8">
                            <div className="bg-surface-850/80 backdrop-blur-md border border-white/[0.04] rounded-2xl p-6 shadow-xl">
                                <h2 className="font-bold text-neutral-200 mb-6 flex items-center gap-2 pb-4 border-b border-white/[0.04]">
                                    <Key size={18} className="text-neon-green" /> Stream Setup
                                </h2>
                                <div className="space-y-5">
                                    <div>
                                        <label className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-2 block">RTMP Server</label>
                                        <div className="bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 flex items-center">
                                            <code className="text-sm text-neutral-300 font-mono flex-1 select-all">{config.RTMP_INGEST_URL || import.meta.env.VITE_RTMP_INGEST_URL}</code>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs uppercase tracking-widest text-neutral-500 font-bold mb-2 block">Stream Key</label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-neutral-300 font-mono break-all line-clamp-1 select-all">
                                                {keyVisible ? user.streamKey : "live_" + "•".repeat(28)}
                                            </code>
                                            <button onClick={() => setKeyVisible(!keyVisible)} className="p-3 bg-surface-800 rounded-xl hover:bg-surface-700 transition-colors border border-white/5">
                                                {keyVisible ? <EyeOff size={16} className="text-neutral-400" /> : <Eye size={16} className="text-neutral-400" />}
                                            </button>
                                            <button onClick={copyKey} className="p-3 bg-surface-800 rounded-xl hover:text-neon-green transition-colors border border-white/5">
                                                {copied ? <Check size={16} className="text-neon-green" /> : <Copy size={16} className="text-neutral-400" />}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-neutral-600 mt-2">🔒 Keep this private. Never show this on stream.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-surface-850/80 backdrop-blur-md border border-white/[0.04] rounded-2xl p-6 shadow-xl">
                                <h2 className="font-bold text-neutral-200 mb-4 flex items-center gap-2 pb-4 border-b border-white/[0.04]">
                                    <Zap size={18} className="text-brand-secondary" /> Quick Start Guide
                                </h2>
                                <ol className="space-y-3 text-sm text-neutral-400">
                                    <li className="flex gap-2"><span className="text-brand-secondary font-bold">1.</span> Open OBS → Settings → Stream</li>
                                    <li className="flex gap-2"><span className="text-brand-secondary font-bold">2.</span> Set Service to Custom</li>
                                    <li className="flex gap-2"><span className="text-brand-secondary font-bold">3.</span> Paste RTMP Server & Key</li>
                                    <li className="flex gap-2"><span className="text-brand-secondary font-bold">4.</span> Click Start Streaming</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Panel (Right Sidebar) */}
            <div className="hidden lg:block h-full shrink-0 shadow-2xl z-10">
                <ChatSidebar
                    messages={messages}
                    connected={connected}
                    historyLoaded={historyLoaded}
                    onSend={sendMessage}
                    mode="live"
                    streamStatus={streamStatus}
                    channelUsername={user.username}
                />
            </div>
        </div>
    );
}
