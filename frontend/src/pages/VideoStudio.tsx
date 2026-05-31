import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Film, Edit3, Trash2, X, Loader2, Save, ExternalLink, Calendar, Image as ImageIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { ThumbnailUploadZone } from "./Dashboard";
import { useChannel, useUpdateVodTitle, useDeleteVod, type StreamItem } from "../hooks/useStreams";

interface EditVodForm {
    title: string;
    thumbnail_url: string;
}

export default function VideoStudio() {
    const { user, token, isLoading } = useAuth();
    const { showToast } = useToast();

    const { data: channelData, isLoading: isFetching } = useChannel(user?.username ?? "");
    const { mutate: updateVod, isPending: isSaving } = useUpdateVodTitle();
    const { mutate: deleteVod } = useDeleteVod();

    const vods = channelData?.vods ?? [];

    const [editingVod, setEditingVod] = useState<StreamItem | null>(null);
    const [deletingVodId, setDeletingVodId] = useState<string | null>(null);

    const { register, handleSubmit, setValue, watch, reset } = useForm<EditVodForm>();
    const watchThumbnail = watch("thumbnail_url");

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center bg-[#0A0A0B]">
                <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    const openEditModal = (vod: StreamItem) => {
        setEditingVod(vod);
        reset({ title: vod.title, thumbnail_url: vod.thumbnail_url });
    };

    const closeEditModal = () => {
        setEditingVod(null);
        reset();
    };

    const onSave = (data: EditVodForm) => {
        if (!editingVod) return;
        updateVod(
            { vodId: editingVod.vod_id!, title: data.title, thumbnail_url: data.thumbnail_url },
            {
                onSuccess: () => {
                    showToast("VOD updated successfully", "success");
                    closeEditModal();
                },
                onError: () => showToast("Failed to update VOD", "error"),
            }
        );
    };

    const handleDelete = (vodId: string) => {
        if (!confirm("Are you sure you want to permanently delete this VOD? This action cannot be undone.")) return;
        
        setDeletingVodId(vodId);
        deleteVod(vodId, {
            onSuccess: () => showToast("VOD deleted", "success"),
            onError: () => showToast("Failed to delete VOD", "error"),
            onSettled: () => setDeletingVodId(null),
        });
    };

    return (
        <div className="flex flex-1 h-[calc(100vh-64px)] w-full overflow-y-auto scrollbar-thin bg-[#0A0A0B] p-6 lg:p-10">
            <div className="max-w-6xl mx-auto w-full space-y-8 animate-fade-in">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <Film className="text-brand-primary" size={32} /> Video Studio
                    </h1>
                    <p className="text-neutral-400 mt-2">Manage your past broadcasts, update thumbnails, or delete old streams.</p>
                </div>

                {isFetching ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
                    </div>
                ) : vods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center bg-surface-900 border border-white/5 rounded-2xl py-20">
                        <Film className="w-16 h-16 text-neutral-700 mb-4" />
                        <h2 className="text-xl font-bold text-neutral-300">No VODs Found</h2>
                        <p className="text-neutral-500 mt-2 text-center max-w-sm">You haven't completed any streams yet. Once you go live and finish a broadcast, it will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {vods.map((vod) => (
                            <div key={vod.vod_id} className="bg-surface-850 border border-white/5 rounded-2xl overflow-hidden flex flex-col group hover:border-brand-primary/30 transition-colors shadow-lg">
                                <div className="relative w-full aspect-video bg-surface-900 shrink-0 overflow-hidden">
                                    {vod.thumbnail_url ? (
                                        <img src={vod.thumbnail_url} alt="thumbnail" className="absolute inset-0 w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex items-center justify-center h-full w-full opacity-30">
                                            <ImageIcon size={32} />
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold text-neutral-300 backdrop-blur-sm border border-white/10">
                                        VOD
                                    </div>
                                    {/* Actions Overlay */}
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                        <button onClick={() => openEditModal(vod)} className="p-3 bg-neon-cyan/20 text-neon-cyan rounded-xl hover:bg-neon-cyan hover:text-black transition-colors" title="Edit VOD">
                                            <Edit3 size={18} />
                                        </button>
                                        <button onClick={() => handleDelete(vod.vod_id!)} disabled={deletingVodId === vod.vod_id} className="p-3 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors" title="Delete VOD">
                                            {deletingVodId === vod.vod_id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 flex flex-col flex-1">
                                    <h3 className="font-bold text-sm text-neutral-200 line-clamp-2 mb-2 leading-tight" title={vod.title || "Untitled Stream"}>
                                        {vod.title || "Untitled Stream"}
                                    </h3>
                                    <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-xs text-neutral-500">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            {new Date(vod.CreatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                        <Link to={`/vod/${vod.vod_id}`} className="hover:text-neon-green transition-colors flex items-center gap-1" title="Watch VOD">
                                            Watch <ExternalLink size={12} />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingVod && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-surface-850 border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-surface-900/50">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Edit3 size={20} className="text-neon-cyan" /> Edit VOD Details
                            </h2>
                            <button onClick={closeEditModal} className="p-2 hover:bg-white/5 rounded-lg text-neutral-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit(onSave)} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-6 overflow-y-auto space-y-6">
                                <div>
                                    <label className="block text-xs uppercase tracking-widest text-neutral-500 font-bold mb-2">VOD Title</label>
                                    <textarea
                                        {...register("title", { required: true })}
                                        className="w-full h-20 bg-surface-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/20 outline-none resize-none transition-all"
                                        placeholder="Enter VOD title..."
                                    />
                                </div>
                                <div>
                                    <ThumbnailUploadZone
                                        currentUrl={watchThumbnail}
                                        token={token ?? ""}
                                        onUploaded={(url) => setValue("thumbnail_url", url)}
                                    />
                                </div>
                            </div>
                            <div className="p-5 border-t border-white/10 bg-surface-900/50 flex justify-end gap-3">
                                <button type="button" onClick={closeEditModal} className="px-5 py-2.5 text-sm font-bold text-neutral-400 hover:text-white transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-5 py-2.5 bg-neon-cyan text-black font-bold rounded-xl text-sm hover:bg-neon-cyan/80 transition-all disabled:opacity-50">
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
