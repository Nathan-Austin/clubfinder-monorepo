import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type VenueType = 'bar' | 'club';

type VenueToggleProps = {
    selectedType: VenueType;
    onTypeChange: (type: VenueType) => void;
};

const VenueToggle: React.FC<VenueToggleProps> = ({ selectedType, onTypeChange }) => {
    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[
                    styles.toggleButton,
                    selectedType === 'bar' ? styles.selectedButton : null
                ]}
                onPress={() => onTypeChange('bar')}
            >
                <Text
                    style={[
                        styles.toggleText,
                        selectedType === 'bar' ? styles.selectedText : null
                    ]}
                >
                    Bars
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    styles.toggleButton,
                    selectedType === 'club' ? styles.selectedButton : null
                ]}
                onPress={() => onTypeChange('club')}
            >
                <Text
                    style={[
                        styles.toggleText,
                        selectedType === 'club' ? styles.selectedText : null
                    ]}
                >
                    Clubs
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#222222',
        borderRadius: 20,
        padding: 3,
        marginVertical: 10,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 18,
        alignItems: 'center',
    },
    selectedButton: {
        backgroundColor: '#D35400',
    },
    toggleText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    selectedText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
});

export default VenueToggle;
