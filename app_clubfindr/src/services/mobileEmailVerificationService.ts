import axiosClient from '../api/axiosClient';

// Send confirmation code for email verification
export const sendVerificationCode = async (email: string): Promise<any> => {
    try {
        // Use the same endpoint as delete account code verification
        // The backend will use the same logic with a different purpose
        const response = await axiosClient.post('/api/send-verification-code', {
            email,
            purpose: 'email_verification' // Specify the purpose to differentiate from account deletion
        });
        return response;
    } catch (error) {
        console.error('Failed to send verification code:', error);
        throw error;
    }
};

// Verify email with confirmation code
export const verifyEmailWithCode = async (email: string, confirmationCode: string): Promise<any> => {
    try {
        console.log(`Verifying email for ${email} with code ${confirmationCode}`);
        const response = await axiosClient.post('/api/verify-email-code', {
            email,
            confirmationCode
        });

        // Make sure we properly handle the response
        if (response && response.data) {
            return {
                success: response.data.success,
                message: response.data.message,
                data: response.data
            };
        } else {
            // Fallback response if data is missing
            console.error('Invalid response format:', response);
            return {
                success: false,
                message: 'Invalid response from server',
                data: {}
            };
        }
    } catch (error) {
        console.error('Failed to verify email:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to verify email',
            data: {}
        };
    }
};

// Resend verification code
export const resendVerificationCode = async (email: string): Promise<any> => {
    try {
        const response = await axiosClient.post('/api/resend-verification-code', {
            email,
            purpose: 'email_verification'
        });
        return response;
    } catch (error) {
        console.error('Failed to resend verification code:', error);
        throw error;
    }
};

export default {
    sendVerificationCode,
    verifyEmailWithCode,
    resendVerificationCode
};