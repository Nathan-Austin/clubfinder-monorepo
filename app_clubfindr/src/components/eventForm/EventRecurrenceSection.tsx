/**
 * The event form's recurrence: a switch, then the pattern. Since 2026-11-19 the server expands
 * a series into its dates (KNOWN_ISSUES 90), so the note says what actually happens; the four
 * patterns here are the ones it knows, and it refuses anything else.
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors } from '../../theme';
import { RECURRENCE_PATTERNS } from '../../utils/eventFormValues';
import { formStyles, switchColours } from './formStyles';

type Props = {
    isRecurring: boolean;
    onIsRecurringChange: (on: boolean) => void;
    pattern: string;
    onPatternChange: (pattern: string) => void;
};

const EventRecurrenceSection = ({ isRecurring, onIsRecurringChange, pattern, onPatternChange }: Props) => (
    <>
        <View style={formStyles.formGroup}>
            <View style={formStyles.switchRow}>
                <Text style={formStyles.label}>Recurring Event</Text>
                <Switch
                    value={isRecurring}
                    onValueChange={onIsRecurringChange}
                    {...switchColours(isRecurring)}
                    testID="event-recurring-switch"
                />
            </View>
        </View>

        {isRecurring && (
            <View style={formStyles.formGroup}>
                <Text style={formStyles.label}>Recurrence Pattern</Text>
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={pattern}
                        onValueChange={(value) => onPatternChange(String(value))}
                        style={styles.picker}
                        dropdownIconColor={colors.text}
                        testID="event-recurrence-pattern"
                    >
                        {RECURRENCE_PATTERNS.map(({ value, label }) => (
                            <Picker.Item key={value} label={label} value={value} color={colors.text} />
                        ))}
                    </Picker>
                </View>
                <Text style={styles.note}>
                    Every date is listed and matched, for the next two months.
                </Text>
            </View>
        )}
    </>
);

const styles = StyleSheet.create({
    pickerContainer: {
        backgroundColor: colors.card,
        borderRadius: 6,
        overflow: 'hidden',
    },
    picker: {
        color: colors.text,
        height: 50,
    },
    note: {
        color: colors.textMuted,
        fontSize: 13,
        marginTop: 6,
    },
});

export default EventRecurrenceSection;
