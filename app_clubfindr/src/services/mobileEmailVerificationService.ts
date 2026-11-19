import axiosClient from '../api/axiosClient';
import { errorMessage, type ApiResult, type ApiResultWithData } from '../types/api';

/** These three return the whole response, so callers read `response.data` */
type ApiResponse = { data: ApiResult };
import { log } from '../utils/logger';

// Send confirmation code for email verification
export const sendVerificationCode = async (email: string): Promise<ApiResponse> => {
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
export const verifyEmailWithCode = async (email: string, confirmationCode: string): Promise<ApiResultWithData> => {
    try {
        // Never the address or the code itself: a confirmation code in a log is a way in
        log.debug('Verifying an e-mail confirmation code');
        const response = await axiosClient.post('/api/verify-email-code', {
            email,
            confirmationCode
        });

        // Make sure we properly handle the response
        if (response && response.data) {
            return {
                success: response.data.success,
                message: response.data.message,
                // Since 2026-11-19 the server also answers with a session (token + user, the
                // same shape as a login), so a verified user goes straight in. An older server
                // sends neither, and the screen falls back to "You can now log in".
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
        // The server's own words ("Invalid confirmation code", "Confirmation code has expired",
        // the five-attempts message): the HTTP client's error says only "HTTP error 400", which
        // is what the screen showed until 2026-11-19 (DEVICE_CHECKLIST, section 5)
        return {
            success: false,
            message: errorMessage(error, 'Could not verify the code. Please try again.'),
            data: {}
        };
    }
};

// Resend verification code
export const resendVerificationCode = async (email: string): Promise<ApiResponse> => {
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