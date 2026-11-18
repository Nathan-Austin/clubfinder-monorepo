/**
 * The venue side's Venue tab: what a venue sets up once (ROADMAP "Venue side of the app", step 9).
 * Editing its profile, its QR codes (a tab of their own until step 9; the Overview has a shortcut)
 * and logging out. Later settings go here as rows.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useVenue } from '../contexts/VenueContext';
import { deleteVenueAccount } from '../services/mobileBarService';
import { colors } from '../theme';

type Row = {
    key: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    hint: string;
    onPress: () => void;
    danger?: boolean;
};

const BarProfileScreen = () => {
    const navigation = useNavigation<{ navigate: (screen: string) => void }>();
    const { logout } = useAuth();
    // Follows Edit Profile's save through the venue context, without reloading on focus
    const { barId, barName } = useVenue();
    const [deleting, setDeleting] = useState(false);

    const handleLogout = () => {
        Alert.alert('Log Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log Out',
                style: 'destructive',
                onPress: async () => {
                    await logout();
                    await AsyncStorage.multiRemove(['barName', 'barId']);
                },
            },
        ]);
    };

    const endSession = async () => {
        await logout();
        await AsyncStorage.multiRemove(['barName', 'barId']);
    };

    const runDeleteVenue = async () => {
        if (!barId || deleting) return;
        setDeleting(true);
        try {
            const result = await deleteVenueAccount(barId);
            if (result.success) {
                Alert.alert('Venue deleted', 'The venue account and everything it owned are gone.');
                await endSession();
                return;
            }
            if (result.sessionEnded) {
                Alert.alert('Session ended', result.error);
                await endSession();
                return;
            }
            Alert.alert('Could not delete the venue', result.error);
        } finally {
            setDeleting(false);
        }
    };

    // Two confirmations, because this is the one action here with no way back
    const handleDeleteVenue = () => {
        Alert.alert(
            'Delete venue account',
            `This permanently deletes ${barName || 'this venue'}: its events, QR codes, check-in history, artists and genres, and every login. This cannot be undone. Your personal account is separate and stays.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: () =>
                        Alert.alert('Are you sure?', 'There is no way back after this.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete for ever', style: 'destructive', onPress: runDeleteVenue },
                        ]),
                },
            ]
        );
    };

    const rows: Row[] = [
        {
            key: 'edit',
            icon: 'create-outline',
            label: 'Edit venue profile',
            hint: 'Name, address, contact details, description, bar type',
            onPress: () => navigation.navigate('EditBarProfile'),
        },
        {
            key: 'qr',
            icon: 'qr-code-outline',
            label: 'QR codes',
            hint: 'Check-in codes to show, share or print',
            onPress: () => navigation.navigate('QRCodeGenerator'),
        },
        {
            key: 'logout',
            icon: 'log-out-outline',
            label: 'Log out',
            hint: 'You can log back in with the venue or your own account',
            onPress: handleLogout,
            danger: true,
        },
        {
            key: 'delete',
            icon: 'trash-outline',
            label: deleting ? 'Deleting venue…' : 'Delete venue account',
            hint: 'Permanently removes the venue, its events, QR codes and check-in history',
            onPress: handleDeleteVenue,
            danger: true,
        },
    ];

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.barName}>{barName || 'My venue'}</Text>
            <Text style={styles.subtitle}>Venue account</Text>

            {rows.map((row) => (
                <TouchableOpacity
                    key={row.key}
                    style={styles.row}
                    onPress={row.onPress}
                    accessibilityRole="button"
                    testID={`bar-profile-${row.key}`}
                >
                    <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.primary} />
                    <View style={styles.rowText}>
                        <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>{row.label}</Text>
                        <Text style={styles.rowHint}>{row.hint}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            ))}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: 16,
    },
    barName: {
        color: colors.text,
        fontSize: 22,
        fontWeight: 'bold',
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 4,
        marginBottom: 20,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
    },
    rowText: {
        flex: 1,
        marginHorizontal: 12,
    },
    rowLabel: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    rowLabelDanger: {
        color: colors.danger,
    },
    rowHint: {
        color: colors.textMuted,
        fontSize: 13,
        marginTop: 2,
    },
});

export default BarProfileScreen;
