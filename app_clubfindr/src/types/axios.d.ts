import { AxiosRequestConfig } from 'axios';

declare module 'axios' {
    export interface AxiosRequestConfig {
        timing?: {
            startTime: number;
            endTime?: number;
        };
    }
}
