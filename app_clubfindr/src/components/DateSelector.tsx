import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DateOption = {
    id: string;
    label: string;
    date: string;
    isRange?: boolean;
    rangeStart?: string;
    rangeEnd?: string;
};

type DateSelectorProps = {
    selectedDate: string;
    onDateChange: (date: string, isRange?: boolean, rangeStart?: string, rangeEnd?: string) => void;
};

// Utility function for formatting dates
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const DateSelector: React.FC<DateSelectorProps> = ({ selectedDate, onDateChange }) => {
    const [showModal, setShowModal] = useState(false);

    const today = new Date();
    const todayStr = formatDate(today);

    const dateOptions = useMemo(() => {
        const options: DateOption[] = [];

        options.push({ id: 'today', label: 'Today', date: todayStr });

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        options.push({ id: 'tomorrow', label: 'Tomorrow', date: formatDate(tomorrow) });

        const endOfWeek = new Date(today);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        options.push({
            id: 'this-week',
            label: 'This Week',
            date: todayStr,
            isRange: true,
            rangeStart: todayStr,
            rangeEnd: formatDate(endOfWeek)
        });

        const thisFriday = new Date(today);
        thisFriday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7));

        const thisSunday = new Date(thisFriday);
        thisSunday.setDate(thisFriday.getDate() + 2);

        options.push({
            id: 'this-weekend',
            label: 'This Weekend',
            date: formatDate(thisFriday),
            isRange: true,
            rangeStart: formatDate(thisFriday),
            rangeEnd: formatDate(thisSunday)
        });

        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));

        const nextWeekEnd = new Date(nextMonday);
        nextWeekEnd.setDate(nextMonday.getDate() + 6);

        options.push({
            id: 'next-week',
            label: 'Next Week',
            date: formatDate(nextMonday),
            isRange: true,
            rangeStart: formatDate(nextMonday),
            rangeEnd: formatDate(nextWeekEnd)
        });

        const nextWeekend = new Date(thisFriday);
        nextWeekend.setDate(nextWeekend.getDate() + 7);

        const nextWeekendEnd = new Date(nextWeekend);
        nextWeekendEnd.setDate(nextWeekend.getDate() + 2);

        options.push({
            id: 'next-weekend',
            label: 'Next Weekend',
            date: formatDate(nextWeekend),
            isRange: true,
            rangeStart: formatDate(nextWeekend),
            rangeEnd: formatDate(nextWeekendEnd)
        });

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 2; i < 14; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);

            options.push({
                id: `date-${i}`,
                label: `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`,
                date: formatDate(date)
            });
        }

        return options;
    }, [todayStr]);

    const selectedOption = useMemo(() => {
        return dateOptions.find(
            option => option.date === selectedDate ||
                (option.isRange && option.rangeStart === selectedDate)
        ) || dateOptions[0];
    }, [dateOptions, selectedDate]);

    const handleSelectDate = (option: DateOption) => {
        console.log(`Date selected: ${option.label}, Date: ${option.date}, IsRange: ${option.isRange}`);

        // Call parent's onDateChange with all necessary parameters
        onDateChange(
            option.isRange && option.rangeStart ? option.rangeStart : option.date,
            option.isRange,
            option.rangeStart,
            option.rangeEnd
        );

        setShowModal(false);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.selector}
                onPress={() => setShowModal(true)}
                activeOpacity={0.7}
            >
                <Text style={styles.dateText}>{selectedOption.label}</Text>
                <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <Modal
                visible={showModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalHeaderText}>Select Date</Text>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={() => setShowModal(false)}
                            >
                                <Ionicons name="close" size={24} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.optionList}>
                            {dateOptions.map((option) => (
                                <TouchableOpacity
                                    key={option.id}
                                    style={[
                                        styles.optionItem,
                                        (option.date === selectedDate ||
                                            (option.isRange && option.rangeStart === selectedDate)) &&
                                        styles.selectedOption
                                    ]}
                                    onPress={() => handleSelectDate(option)}
                                >
                                    <Text style={[
                                        styles.optionText,
                                        (option.date === selectedDate ||
                                            (option.isRange && option.rangeStart === selectedDate)) &&
                                        styles.selectedOptionText
                                    ]}>
                                        {option.label}
                                    </Text>

                                    {(option.date === selectedDate ||
                                        (option.isRange && option.rangeStart === selectedDate)) && (
                                            <Ionicons
                                                name="checkmark"
                                                size={20}
                                                color="#D35400"
                                                style={styles.checkIcon}
                                            />
                                        )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 10
    },
    selector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#333',
        padding: 10,
        borderRadius: 20,
        justifyContent: 'space-between'
    },
    dateText: {
        color: '#FFF',
        fontWeight: '600',
        marginRight: 8,
        flex: 1
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.7)'
    },
    modalContent: {
        backgroundColor: '#1A1A1A',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333'
    },
    modalHeaderText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold'
    },
    closeButton: {
        padding: 5
    },
    optionList: {
        maxHeight: 300
    },
    optionItem: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    optionText: {
        color: '#FFF',
        fontSize: 16,
        flex: 1
    },
    selectedOption: {
        backgroundColor: '#444'
    },
    selectedOptionText: {
        fontWeight: 'bold',
        color: '#D35400'
    },
    checkIcon: {
        marginLeft: 8
    },
});

export default DateSelector;