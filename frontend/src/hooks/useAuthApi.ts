import { useMutation } from "@tanstack/react-query";
import axios from "axios";

const API = import.meta.env.VITE_API_URL;

interface AuthResponse {
    token: string;
    username: string;
    stream_key: string;
}

export function useLoginMutation() {
    return useMutation({
        mutationFn: async (credentials: any) => {
            const { data } = await axios.post<AuthResponse>(`${API}/auth/login`, credentials);
            return data;
        },
    });
}

export function useRegisterMutation() {
    return useMutation({
        mutationFn: async (credentials: any) => {
            const { data } = await axios.post<AuthResponse>(`${API}/auth/register`, credentials);
            return data;
        },
    });
}
