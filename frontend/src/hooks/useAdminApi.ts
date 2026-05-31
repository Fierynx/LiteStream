import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import axios from "axios";

const API = import.meta.env.VITE_API_URL;

export function useAdminLogin() {
    return useMutation({
        mutationFn: async (password: string) => {
            const { data } = await axios.post(`${API}/admin/login`, { password });
            return data;
        },
    });
}

export function useInfraStatus(adminToken: string) {
    return useQuery({
        queryKey: ["infraStatus"],
        queryFn: async () => {
            const { data } = await axios.get(`${API}/admin/infra/status`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });
            return data;
        },
        enabled: !!adminToken,
    });
}

export function useInfraEvents(adminToken: string) {
    return useQuery({
        queryKey: ["infraEvents"],
        queryFn: async () => {
            const { data } = await axios.get(`${API}/admin/infra/events`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });
            return data.data;
        },
        enabled: !!adminToken,
        refetchInterval: 5000,
    });
}

export function useAwsConfig(adminToken: string) {
    return useQuery({
        queryKey: ["awsConfig"],
        queryFn: async () => {
            const { data } = await axios.get(`${API}/admin/settings`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });
            return data;
        },
        enabled: !!adminToken,
    });
}

export function useSaveAwsConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ token, config }: { token: string; config: any }) => {
            await axios.post(`${API}/admin/settings`, config, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["awsConfig"] });
        },
    });
}

export function useProvisionInfra() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (token: string) => {
            await axios.post(`${API}/admin/infra/provision`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["infraEvents"] });
        },
    });
}

export function useDeprovisionInfra() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (token: string) => {
            await axios.post(`${API}/admin/infra/deprovision`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["infraEvents"] });
        },
    });
}
