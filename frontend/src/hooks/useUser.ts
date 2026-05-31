import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import axios from "axios";

const API = import.meta.env.VITE_API_URL;

export function useFollow() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (username: string) => {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API}/user/follow/${username}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
        },
        onSuccess: (_, username) => {
            queryClient.invalidateQueries({ queryKey: ["isFollowing", username] });
        },
    });
}

export function useUnfollow() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (username: string) => {
            const token = localStorage.getItem("token");
            await axios.delete(`${API}/user/unfollow/${username}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: (_, username) => {
            queryClient.invalidateQueries({ queryKey: ["isFollowing", username] });
        },
    });
}

export function useIsFollowing(username: string, enabled = true) {
    return useQuery({
        queryKey: ["isFollowing", username],
        queryFn: async () => {
            const token = localStorage.getItem("token");
            if (!token) return false;
            try {
                const { data } = await axios.get<{ data: boolean }>(
                    `${API}/user/isfollowing/${username}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                return data.data;
            } catch (err) {
                return false;
            }
        },
        enabled: !!username && enabled,
    });
}
