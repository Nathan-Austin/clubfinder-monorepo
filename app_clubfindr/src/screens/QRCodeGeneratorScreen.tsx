// screens/QRCodeGeneratorScreen.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    ActivityIndicator,
    Share,
    Alert,
    ScrollView
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

type QRCodeData = {
    id: string;
    title: string;
    type: 'entrance' | 'table' | 'event' | 'promotion';
    qrValue: string;
    createdAt: string;
};

const QRCodeGeneratorScreen = () => {
    const svgRef = React.useRef<any>(null);
    const [qrCodes, setQrCodes] = useState<QRCodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newCodeTitle, setNewCodeTitle] = useState('');
    const [newCodeType, setNewCodeType] = useState<'entrance' | 'table' | 'event' | 'promotion'>('entrance');
    const [selectedQR, setSelectedQR] = useState<QRCodeData | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);

    useEffect(() => {
        loadQRCodes();
    }, []);

    const loadQRCodes = async () => {
        try {
            setLoading(true);
            const barId = await AsyncStorage.getItem('barId');
            if (!barId) {
                Alert.alert('Error', 'Bar ID not found. Please log in again.');
                return;
            }

            const response = await axiosClient.get(`/api/mobile/bars/${barId}/qrcodes`);
            if (response.data.success) {
                setQrCodes(response.data.qrCodes || []);
            }
        } catch (error) {
            console.error('Error loading QR codes:', error);
            Alert.alert('Error', 'Failed to load QR codes. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const createQRCode = async () => {
        if (!newCodeTitle.trim()) {
            Alert.alert('Error', 'Please enter a title for your QR code');
            return;
        }

        try {
            setCreating(true);
            const barId = await AsyncStorage.getItem('barId');
            const barName = await AsyncStorage.getItem('barName') || 'Your Bar';

            const response = await axiosClient.post(`/api/mobile/bars/${barId}/qrcodes`, {
                title: newCodeTitle,
                type: newCodeType,
                barName
            });

            if (response.data.success) {
                await loadQRCodes();
                setNewCodeTitle('');
                setShowCreateModal(false);
                Alert.alert('Success', 'QR code created successfully!');
            } else {
                Alert.alert('Error', response.data.message || 'Failed to create QR code');
            }
        } catch (error) {
            console.error('Error creating QR code:', error);
            Alert.alert('Error', 'Failed to create QR code. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const shareQRCode = async (qrCode: QRCodeData) => {
        try {
            const getDataURL = () => {
                return new Promise((resolve, reject) => {
                    svgRef.current?.toDataURL(callback);
                    function callback(dataURL: string) {
                        resolve(dataURL);
                    }
                });
            };

            setSelectedQR(qrCode);
            setShowQRModal(true);

            // Wait for modal to show and QR code to render
            setTimeout(async () => {
                if (svgRef.current) {
                    const dataURL = await getDataURL();
                    const filePath = `${FileSystem.cacheDirectory}qrcode-${qrCode.id}.png`;
                    const data = (dataURL as string).split(',')[1];
                    await FileSystem.File.write(filePath, data, {
                        encoding: 'base64',
                    });

                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(filePath);
                    } else {
                        Alert.alert('Sharing not available', 'Sharing is not available on this device');
                    }
                }
                setShowQRModal(false);
            }, 500);
        } catch (error) {
            console.error('Error sharing QR code:', error);
            Alert.alert('Error', 'Failed to share QR code');
            setShowQRModal(false);
        }
    };

    const requestPromotionPackage = async (qrCode: QRCodeData) => {
        try {
            const barId = await AsyncStorage.getItem('barId');
            const barName = await AsyncStorage.getItem('barName') || 'Unknown Bar';

            // Generate a reference number for this print request
            const referenceNumber = `PRINT-${Date.now().toString(36).toUpperCase()}`;

            const response = await axiosClient.post(`/api/mobile/bars/${barId}/qrcodes/${qrCode.id}/promotion`, {
                requestType: 'printed_materials',
                referenceNumber: referenceNumber,
                qrValue: qrCode.qrValue,  // Include the actual QR code value
                qrTitle: qrCode.title,
                barName: barName
            });

            if (response.data.success) {
                Alert.alert(
                    'Request Submitted',
                    `Your QR code promotion package request has been submitted. Reference #: ${referenceNumber}. Our team will contact you soon.`
                );
            } else {
                Alert.alert('Error', response.data.message || 'Failed to submit request');
            }
        } catch (error) {
            console.error('Error requesting promotion package:', error);
            Alert.alert('Error', 'Failed to submit request. Please try again.');
        }
    };

    const deleteQRCode = async (qrCode: QRCodeData) => {
        Alert.alert(
            'Delete QR Code',
            `Are you sure you want to delete "${qrCode.title}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const barId = await AsyncStorage.getItem('barId');
                            const response = await axiosClient.delete(`/api/mobile/bars/${barId}/qrcodes/${qrCode.id}`);

                            if (response.data.success) {
                                await loadQRCodes();
                                Alert.alert('Success', 'QR code deleted successfully');
                            } else {
                                Alert.alert('Error', response.data.message || 'Failed to delete QR code');
                            }
                        } catch (error) {
                            console.error('Error deleting QR code:', error);
                            Alert.alert('Error', 'Failed to delete QR code. Please try again.');
                        }
                    }
                }
            ]
        );
    };

    const getQRTypeLabel = (type: string): string => {
        switch (type) {
            case 'entrance': return 'Main Entrance';
            case 'table': return 'Table';
            case 'event': return 'Special Event';
            case 'promotion': return 'Promotion';
            default: return type;
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#D35400" />
                <Text style={styles.loadingText}>Loading QR codes...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>QR Code Management</Text>
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => setShowCreateModal(true)}
                >
                    <Text style={styles.createButtonText}>+ Create New</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.qrList}>
                {qrCodes.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyStateText}>
                            No QR codes created yet. Create your first QR code to allow customers to check in.
                        </Text>
                    </View>
                ) : (
                    qrCodes.map((qrCode) => (
                        <View key={qrCode.id} style={styles.qrItem}>
                            <View style={styles.qrItemHeader}>
                                <Text style={styles.qrTitle}>{qrCode.title}</Text>
                                <Text style={styles.qrType}>{getQRTypeLabel(qrCode.type)}</Text>
                            </View>

                            <View style={styles.qrCodePreview}>
                                <QRCode
                                    value={qrCode.qrValue}
                                    size={100}
                                    color="#000000"
                                    backgroundColor="#FFFFFF"
                                />
                            </View>

                            <View style={styles.qrActions}>
                                <TouchableOpacity
                                    style={styles.qrActionButton}
                                    onPress={() => shareQRCode(qrCode)}
                                >
                                    <Text style={styles.qrActionText}>Share</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.qrActionButton}
                                    onPress={() => requestPromotionPackage(qrCode)}
                                >
                                    <Text style={styles.qrActionText}>Request Prints</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.qrActionButton, styles.deleteButton]}
                                    onPress={() => deleteQRCode(qrCode)}
                                >
                                    <Text style={styles.deleteButtonText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Create QR Code Modal */}
            <Modal
                visible={showCreateModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowCreateModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Create New QR Code</Text>

                        <Text style={styles.inputLabel}>QR Code Title</Text>
                        <TextInput
                            style={styles.input}
                            value={newCodeTitle}
                            onChangeText={setNewCodeTitle}
                            placeholder="e.g., Main Entrance, VIP Area, etc."
                            placeholderTextColor="#999"
                        />

                        <Text style={styles.inputLabel}>QR Code Type</Text>
                        <View style={styles.typeSelector}>
                            {(['entrance', 'table', 'event', 'promotion'] as const).map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.typeOption,
                                        newCodeType === type && styles.selectedType
                                    ]}
                                    onPress={() => setNewCodeType(type)}
                                >
                                    <Text style={[
                                        styles.typeOptionText,
                                        newCodeType === type && styles.selectedTypeText
                                    ]}>
                                        {getQRTypeLabel(type)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => setShowCreateModal(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.confirmButton}
                                onPress={createQRCode}
                                disabled={creating}
                            >
                                {creating ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.confirmButtonText}>Create</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* QR Code Preview Modal for Sharing */}
            <Modal
                visible={showQRModal}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.qrModalContent}>
                        {selectedQR && (
                            <QRCode
                                value={selectedQR.qrValue}
                                size={300}
                                color="#000000"
                                backgroundColor="#FFFFFF"
                                getRef={(ref) => (svgRef.current = ref)}
                            />
                        )}
                        <ActivityIndicator size="large" color="#D35400" style={styles.qrModalLoader} />
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#CCCCCC',
        marginTop: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    createButton: {
        backgroundColor: '#D35400',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 5,
    },
    createButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    qrList: {
        flex: 1,
        padding: 15,
    },
    emptyState: {
        padding: 20,
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
    },
    emptyStateText: {
        color: '#CCCCCC',
        textAlign: 'center',
        lineHeight: 22,
    },
    qrItem: {
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
    },
    qrItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    qrTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    qrType: {
        fontSize: 12,
        color: '#D35400',
        backgroundColor: 'rgba(211, 84, 0, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    qrCodePreview: {
        backgroundColor: '#FFFFFF',
        padding: 10,
        alignItems: 'center',
        borderRadius: 8,
        marginBottom: 15,
    },
    qrActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    qrActionButton: {
        flex: 1,
        backgroundColor: '#333333',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 5,
        alignItems: 'center',
        marginHorizontal: 5,
    },
    qrActionText: {
        color: '#FFFFFF',
    },
    deleteButton: {
        backgroundColor: '#40000',
        borderWidth: 1,
        borderColor: '#FF5252',
    },
    deleteButtonText: {
        color: '#FF5252',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 20,
        width: '90%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 20,
        textAlign: 'center',
    },
    inputLabel: {
        color: '#FFFFFF',
        fontSize: 14,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#333333',
        color: '#FFFFFF',
        padding: 12,
        borderRadius: 5,
        marginBottom: 15,
    },
    typeSelector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20,
    },
    typeOption: {
        backgroundColor: '#333333',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 5,
        margin: 5,
    },
    selectedType: {
        backgroundColor: '#D35400',
    },
    typeOptionText: {
        color: '#FFFFFF',
    },
    selectedTypeText: {
        fontWeight: 'bold',
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#333333',
        padding: 12,
        borderRadius: 5,
        alignItems: 'center',
        marginRight: 10,
    },
    cancelButtonText: {
        color: '#FFFFFF',
    },
    confirmButton: {
        flex: 1,
        backgroundColor: '#D35400',
        padding: 12,
        borderRadius: 5,
        alignItems: 'center',
        marginLeft: 10,
    },
    confirmButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    qrModalContent: {
        backgroundColor: '#FFFFFF',
        padding: 20,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    qrModalLoader: {
        position: 'absolute',
    },
});

export default QRCodeGeneratorScreen;
