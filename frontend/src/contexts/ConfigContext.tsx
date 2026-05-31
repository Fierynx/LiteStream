import React, { createContext, useContext } from 'react';

interface Config {
    PUBLIC_VOD_BASE_URL?: string;
    SQS_QUEUE_URL?: string;
    S3_BUCKET_NAME?: string;
    RTMP_INGEST_URL?: string;
}

interface ConfigContextType {
    config: Config;
    loading: boolean;
}

const ConfigContext = createContext<ConfigContextType>({ config: {}, loading: true });

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data: config = {}, isLoading: loading } = useQuery({
        queryKey: ['config'],
        queryFn: async () => {
            const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/config`);
            return data;
        },
        staleTime: Infinity, // config rarely changes
    });

    return (
        <ConfigContext.Provider value={{ config, loading }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => useContext(ConfigContext);
