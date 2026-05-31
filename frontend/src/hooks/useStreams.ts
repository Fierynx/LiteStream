import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const API = import.meta.env.VITE_API_URL;

export interface StreamItem {
    id: number;
    username: string;
    title: string;
    thumbnail_url: string;
    status: "live" | "vod";
    views: number;
    CreatedAt: string;
    vod_id?: string;
    stream_key?: string;
    video_offset?: number;
}

export interface ChannelInfo {
    username: string;
    title: string;
    stream_key: string;
    vod_id?: string;
    thumbnail_url: string;
    status: "offline" | "live" | "vod";
}

export function useStreams() {
    return useQuery({
        queryKey: ["streams"],
        queryFn: async () => {
            const { data } = await axios.get<{ data: StreamItem[] }>(`${API}/streams`);
            return data.data;
        },
        refetchInterval: 5000,
    });
}

export function useChannel(username: string, isPolling = false) {
    return useQuery({
        queryKey: ["channel", username],
        queryFn: async () => {
            const { data } = await axios.get<{ data: ChannelInfo; vods: StreamItem[] }>(
                `${API}/channel/${username}`
            );
            return data;
        },
        enabled: !!username,
        refetchInterval: isPolling ? 3000 : false,
    });
}

export function useDeleteVod() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (vodId: string) => {
            const token = localStorage.getItem("ls_token");
            await axios.delete(`${API}/stream/vod/${vodId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["streams"] });
        },
    });
}

export function useUpdateVodTitle() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ vodId, title }: { vodId: string; title: string }) => {
            const token = localStorage.getItem("ls_token");
            await axios.patch(
                `${API}/stream/vod/${vodId}`,
                { title },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["streams"] });
        },
    });
}

export function useUpdateStreamSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ title, thumbnail_url, token }: { title: string; thumbnail_url: string; token: string }) => {
            await axios.patch(
                `${API}/stream/settings`,
                { title, thumbnail_url },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["channel"] });
        },
    });
}

export function useUploadThumbnail() {
    return useMutation({
        mutationFn: async ({ file, token }: { file: File; token: string }) => {
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
                }
            );
            return data;
        },
    });
}
