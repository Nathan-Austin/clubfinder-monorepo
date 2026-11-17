/** The venue event form's field styles, shared by its sections (dark, from the app's palette). */
import { StyleSheet } from 'react-native';
import { colors } from '../../theme';

export const formStyles = StyleSheet.create({
    formGroup: {
        marginBottom: 20,
    },
    label: {
        color: colors.text,
        fontSize: 16,
        marginBottom: 8,
        fontWeight: '500',
    },
    errorText: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 5,
    },
    field: {
        backgroundColor: colors.card,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 6,
    },
    fieldText: {
        color: colors.text,
        fontSize: 16,
    },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});

/** A Switch's colours on the dark form */
export const switchColours = (on: boolean) => ({
    trackColor: { false: '#444444', true: colors.primary },
    thumbColor: on ? '#FFFFFF' : '#F4F3F4',
});
