export interface LoginResponse {
    success: boolean;
    token: string;
    user: {
        id: string;
        name?: string;
        email: string;
        city?: string;
        isFirstTimeUser?: boolean;
        emailVerified?: boolean;
        onboarding_complete?: boolean;
    };
    message?: string;
}
