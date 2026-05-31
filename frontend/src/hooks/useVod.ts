import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";

const API = import.meta.env.VITE_API_URL;

export interface ApiChatMessage {
    user: string;
    text: string;
    color?: string;
    video_offset?: number;
}

export function useChatHistory(vodId: string, enabled = true) {
    return useQuery({
        queryKey: ["chatHistory", vodId],
        queryFn: async () => {
            const { data } = await axios.get<{ data: ApiChatMessage[] }>(`${API}/chat/${vodId}`);
            return data.data ?? [];
        },
        enabled: !!vodId && enabled,
    });
}

export function useIncrementView() {
    return useMutation({
        mutationFn: async (vodId: string) => {
            await axios.post(`${API}/streams/${vodId}/view`);
        },
    });
}
