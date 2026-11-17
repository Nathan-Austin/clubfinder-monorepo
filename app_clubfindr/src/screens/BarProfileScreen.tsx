/**
 * The venue side's Profile tab (KNOWN_ISSUES 86): editing the venue's profile and logging out,
 * which were two of the four buttons in a row across the dashboard's header that did not fit on a
 * phone.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useVenue } from '../contexts/VenueContext';
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
    const { barName } = useVenue();

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

    const rows: Row[] = [
        {
            key: 'edit',
            icon: 'create-outline',
            label: 'Edit venue profile',
            hint: 'Name, address, contact details, description, bar type',
            onPress: () => navigation.navigate('EditBarProfile'),
        },
        {
            key: 'logout',
            icon: 'log-out-outline',
            label: 'Log out',
            hint: 'You can log back in with the venue or your own account',
            onPress: handleLogout,
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
