/**
 * Choosing between the customer login and the venue ("Bar Manager") login, from LoginScreen.
 * Its own file to keep that screen to the login itself.
 */
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

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
    backgroundColor: colors.overlaySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surfaceAlt,
    width: '80%',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: colors.text,
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
    backgroundColor: colors.primaryA20,
    borderRadius: 5,
  },
  loginOptionText: {
    color: colors.text,
    fontSize: 16,
    marginLeft: 10,
  },
  closeModalButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  closeModalText: {
    color: colors.text,
    fontWeight: 'bold',
  },
});

export default LoginTypeModal;
