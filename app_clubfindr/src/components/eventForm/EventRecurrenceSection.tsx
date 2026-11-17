/**
 * The event form's recurrence: a switch, then the pattern. The server stores it but does not
 * expand it into dates yet, so a recurring event counts on its first date only (KNOWN_ISSUES 90);
 * the note says so rather than promise every week.
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
                    Currently listed and matched on the first date only; repeating dates are coming soon.
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
