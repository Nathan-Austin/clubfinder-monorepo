export interface LoginResponse {
    success: boolean;
    token: string;
    user: {
        id: string;
        name?: string;
        email: string;
        city?: string;
        spotify_id?: string;
        spotify_app_name?: string;
        clientId?: string;
        clientSecret?: string;
        isFirstTimeUser?: boolean;
        emailVerified?: boolean;
        onboarding_complete?: boolean;
    };
    message?: string;
}
