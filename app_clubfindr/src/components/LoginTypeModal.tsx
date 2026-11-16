/**
 * Choosing between the customer login and the venue ("Bar Manager") login, from LoginScreen.
 * Its own file to keep that screen to the login itself.
 */
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  isBarLoginMode: boolean;
  onSelect: (isBar: boolean) => void;
  onClose: () => void;
};

const LoginTypeModal = ({ visible, isBarLoginMode, onSelect, onClose }: Props) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={styles.modalOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Select Login Type</Text>

        <TouchableOpacity
          style={[styles.loginTypeOption, !isBarLoginMode && styles.selectedOption]}
          onPress={() => onSelect(false)}
        >
          <Ionicons
            name={!isBarLoginMode ? "radio-button-on" : "radio-button-off"}
            size={24}
            color={!isBarLoginMode ? "#D35400" : "#FFFFFF"}
          />
          <Text style={styles.loginOptionText}>Customer Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.loginTypeOption, isBarLoginMode && styles.selectedOption]}
          onPress={() => onSelect(true)}
        >
          <Ionicons
            name={isBarLoginMode ? "radio-button-on" : "radio-button-off"}
            size={24}
            color={isBarLoginMode ? "#D35400" : "#FFFFFF"}
          />
          <Text style={styles.loginOptionText}>Bar Manager Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeModalButton}
          onPress={onClose}
        >
          <Text style={styles.closeModalText}>Close</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222222',
    width: '80%',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  loginTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginVertical: 5,
    paddingHorizontal: 10,
  },
  selectedOption: {
    backgroundColor: 'rgba(211, 84, 0, 0.2)',
    borderRadius: 5,
  },
  loginOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 10,
  },
  closeModalButton: {
    backgroundColor: '#D35400',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  closeModalText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});

export default LoginTypeModal;
