// SpotifySetupStatus.tsx - with initial delay

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import axiosClient from '../api/axiosClient';

interface SpotifySetupStatusProps {
    userId: string;
    onComplete: () => void;
}

const SpotifySetupStatus = ({ userId, onComplete }: SpotifySetupStatusProps) => {
    const [status, setStatus] = useState<'pending' | 'complete' | 'error'>('pending');
    const [message, setMessage] = useState('Setting up your Spotify integration...');
    const [checkCount, setCheckCount] = useState(0);
    const [failedChecks, setFailedChecks] = useState(0);
    const [initialDelayComplete, setInitialDelayComplete] = useState(false);

    // Use refs to track intervals and timeouts to prevent closure issues
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isChecking = useRef(false);

    // Define the check status function outside useEffect to avoid recreation
    const checkStatus = async () => {
        // Prevent multiple concurrent checks
        if (isChecking.current) return;

        isChecking.current = true;

        try {
            console.log(`Checking status for userId: ${userId}, check #${checkCount + 1}`);

            const response = await axiosClient.get(`/api/mobile/spotify/setup-status`, {
                params: { userId }
            });
            const data = response.data as {
                success: boolean;
                status: 'pending' | 'complete' | 'error';
                message?: string;
            };

            if (data.success) {
                if (data.status === 'complete') {
                    console.log('Setup complete, clearing interval');
                    setStatus('complete');
                    setMessage('Spotify integration complete! You can now connect to Spotify.');

                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }

                    onComplete();
                } else if (data.status === 'error') {
                    console.log('Setup error, clearing interval');
                    setStatus('error');
                    setMessage(data.message || 'Failed to complete Spotify integration. You can try again later.');

                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
            }

            // Update check count only after successful check
            setCheckCount(prev => prev + 1);
        } catch (error) {
            console.error('Failed to check Spotify integration status:', error);
            setFailedChecks(prev => prev + 1);
        } finally {
            isChecking.current = false;
        }
    };

    // First, set up the initial delay
    useEffect(() => {
        console.log(`Waiting 20 seconds before checking Spotify integration status for user ${userId}`);
        setMessage('Connecting to Spotify. This may take about 20 seconds...');

        const initialDelayTimeout = setTimeout(() => {
            console.log('Initial delay complete, beginning status checks');
            setInitialDelayComplete(true);
            setMessage('Setting up your Spotify integration...');
        }, 20000); // 20 seconds delay

        return () => {
            clearTimeout(initialDelayTimeout);
        };
    }, [userId]);

    // Then, only start the status checks after the initial delay
    useEffect(() => {
        // Only proceed if the initial delay is complete
        if (!initialDelayComplete) return;

        console.log(`Beginning Spotify integration status checks for user ${userId}`);

        // Initial check
        checkStatus();

        // Determine appropriate interval based on check count
        const getCheckInterval = (count: number) => {
            if (count < 5) return 5000;       // First 5 checks: every 5 seconds
            if (count < 10) return 10000;     // Next 5 checks: every 10 seconds
            return 15000;                     // After 10 checks: every 15 seconds
        };

        // Set up interval for status checks
        intervalRef.current = setInterval(checkStatus, getCheckInterval(0));

        // Set a timeout to stop checking after 2 minutes max
        timeoutRef.current = setTimeout(() => {
            console.log('Timeout reached, stopping interval');
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (status === 'pending') {
                setStatus('error');
                setMessage('Spotify integration timed out. Please try again later.');
            }
        }, 120000);

        // Clean up intervals and timeouts on unmount
        return () => {
            console.log('Cleaning up intervals and timeouts');
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [userId, initialDelayComplete]); // Only run when initialDelayComplete becomes true

    // Handle excessive failed checks
    useEffect(() => {
        if (failedChecks >= 3) {
            console.log('Too many failed checks, showing error');
            setStatus('error');
            setMessage('Having trouble confirming setup. You can proceed to login.');

            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [failedChecks]);

    return (
        <View style={styles.container}>
            {status === 'pending' && (
                <ActivityIndicator size="large" color="#1DB954" style={styles.spinner} />
            )}

            <Text style={[
                styles.statusText,
                status === 'complete' ? styles.successText :
                    status === 'error' ? styles.errorText :
                        styles.pendingText
            ]}>
                {message}
            </Text>

            {status === 'pending' && (
                <Text style={styles.infoText}>
                    {initialDelayComplete
                        ? "We're checking the status of your integration..."
                        : "Please wait while we connect your account..."}
                </Text>
            )}

            {status === 'error' && (
                <TouchableOpacity
                    style={styles.proceedButton}
                    onPress={onComplete}
                >
                    <Text style={styles.proceedButtonText}>Proceed to Login</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 20,
        backgroundColor: '#333333',
        borderRadius: 8,
        marginVertical: 10,
        alignItems: 'center',
    },
    spinner: {
        marginBottom: 15,
    },
    statusText: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 10,
    },
    pendingText: {
        color: '#FFFFFF',
    },
    successText: {
        color: '#1DB954',
    },
    errorText: {
        color: '#FF4D4F',
    },
    infoText: {
        color: '#CCCCCC',
        fontSize: 14,
        textAlign: 'center',
    },
    proceedButton: {
        backgroundColor: '#1DB954',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
        marginTop: 15,
    },
    proceedButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    }
});

export default SpotifySetupStatus;
