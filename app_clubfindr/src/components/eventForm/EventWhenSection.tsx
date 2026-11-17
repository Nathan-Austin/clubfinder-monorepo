/**
 * The event form's "when": the date, and optional start and end times, each with its picker
 * (react-native-paper-dates). Moved out of EventFormScreen unchanged in behaviour; the screen
 * keeps the values.
 */
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { formStyles, switchColours } from './formStyles';

type Props = {
    eventDate: Date;
    onEventDateChange: (date: Date) => void;
    startTime: Date;
    onStartTimeChange: (time: Date) => void;
    hasStartTime: boolean;
    onHasStartTimeChange: (on: boolean) => void;
    endTime: Date;
    onEndTimeChange: (time: Date) => void;
    hasEndTime: boolean;
    onHasEndTimeChange: (on: boolean) => void;
    endTimeError?: string;
};

const formatDay = (date: Date) =>
    date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

const withTime = (base: Date, hours: number, minutes: number) => {
    const next = new Date(base);
    next.setHours(hours);
    next.setMinutes(minutes);
    return next;
};

type TimeFieldProps = {
    label: string;
    value: Date;
    onChange: (time: Date) => void;
    enabled: boolean;
    onEnabledChange: (on: boolean) => void;
    testID: string;
};

const TimeField = ({ label, value, onChange, enabled, onEnabledChange, testID }: TimeFieldProps) => {
    const [picking, setPicking] = useState(false);
    return (
        <View style={styles.timeGroup}>
            <View style={styles.timeHeader}>
                <Text style={formStyles.label}>{label}</Text>
                <Switch value={enabled} onValueChange={onEnabledChange} {...switchColours(enabled)} testID={`${testID}-switch`} />
            </View>
            {enabled && (
                <TouchableOpacity style={formStyles.field} onPress={() => setPicking(true)} testID={testID}>
                    <Text style={formStyles.fieldText}>{formatTime(value)}</Text>
                    <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
            )}
            <TimePickerModal
                visible={picking && enabled}
                onDismiss={() => setPicking(false)}
                onConfirm={({ hours, minutes }) => {
                    onChange(withTime(value, hours, minutes));
                    setPicking(false);
                }}
                locale="en"
            />
        </View>
    );
};

const EventWhenSection = (props: Props) => {
    const [pickingDate, setPickingDate] = useState(false);
    return (
        <>
            <View style={formStyles.formGroup}>
                <Text style={formStyles.label}>Event Date *</Text>
                <TouchableOpacity style={formStyles.field} onPress={() => setPickingDate(true)} testID="event-date">
                    <Text style={formStyles.fieldText}>{formatDay(props.eventDate)}</Text>
                    <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <DatePickerModal
                    visible={pickingDate}
                    mode="single"
                    date={props.eventDate}
                    locale="en"
                    onDismiss={() => setPickingDate(false)}
                    onConfirm={({ date }) => {
                        setPickingDate(false);
                        if (date) props.onEventDateChange(date);
                    }}
                />
            </View>

            <View style={styles.timeRow}>
                <TimeField
                    label="Start Time"
                    value={props.startTime}
                    onChange={props.onStartTimeChange}
                    enabled={props.hasStartTime}
                    onEnabledChange={props.onHasStartTimeChange}
                    testID="event-start-time"
                />
                <TimeField
                    label="End Time"
                    value={props.endTime}
                    onChange={props.onEndTimeChange}
                    enabled={props.hasEndTime}
                    onEnabledChange={props.onHasEndTimeChange}
                    testID="event-end-time"
                />
            </View>
            {props.endTimeError ? <Text style={[formStyles.errorText, styles.timeError]}>{props.endTimeError}</Text> : null}
        </>
    );
};

const styles = StyleSheet.create({
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    timeGroup: {
        width: '48%',
    },
    timeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    timeError: {
        marginTop: -12,
        marginBottom: 20,
    },
});

export default EventWhenSection;
