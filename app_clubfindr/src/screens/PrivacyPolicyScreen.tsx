import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

type PrivacyPolicyScreenNavigationProp = StackNavigationProp<any>;

const PrivacyPolicyScreen = () => {
    const navigation = useNavigation<PrivacyPolicyScreenNavigationProp>();

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" />
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacy Policy</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.scrollView}>
                <View style={styles.content}>
                    <Text style={styles.title}>Privacy Policy of Tilki</Text>
                    <Text style={styles.paragraph}>
                        This Application collects some Personal Data from its Users.
                    </Text>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Owner and Data Controller</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>Tilki</Text>{'\n'}
                            Owned and operated by Nathan Austin{'\n'}
                            Südostallee 124{'\n'}
                            12487 Berlin, Germany
                        </Text>
                        <Text style={styles.paragraph}>
                            Owner contact email: admin@clubfindr.com
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Types of Data Collected</Text>
                        <Text style={styles.paragraph}>
                            Among the types of Personal Data that this Application collects, by itself or through third
                            parties, there are:
                        </Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Personal Identification Information:</Text> Name; Email addresses (general and
                                platform-specific, such as Spotify, Apple Music, Deezer); Phone number; Postal address;
                                Password (stored as a hashed value).
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Account and Authentication Data:</Text> User IDs; Session IDs; Access tokens and
                                refresh tokens for our Application and third-party services; Confirmation codes and
                                verification details.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Preferences and Usage Data:</Text> Genre preferences; Cookie preferences; Session
                                activity and timestamps.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Location Data:</Text> City; Geographic position; Precise location.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Usage Data and Cookies:</Text> Trackers; Usage Data; number of Users; session
                                statistics.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Mode and Place of Processing the Data</Text>

                        <Text style={styles.subSectionTitle}>Methods of Processing</Text>
                        <Text style={styles.paragraph}>
                            The Owner takes appropriate security measures to prevent unauthorized access, disclosure,
                            modification, or unauthorized destruction of the Data.
                        </Text>
                        <Text style={styles.paragraph}>
                            The Data processing is carried out using computers and IT-enabled tools, following
                            organizational procedures and modes strictly related to the purposes indicated.
                        </Text>

                        <Text style={styles.subSectionTitle}>Place</Text>
                        <Text style={styles.paragraph}>
                            All data processing and storage occur within Germany and the European Union. No personal data
                            is transferred outside these regions.
                        </Text>

                        <Text style={styles.subSectionTitle}>Retention Time</Text>
                        <Text style={styles.paragraph}>
                            Personal Data shall be processed and stored for as long as required by the purpose they have
                            been collected for and may be retained longer due to applicable legal obligations.
                        </Text>
                        <Text style={styles.paragraph}>
                            If a User has not logged in within the period specified by German law (e.g., two years), their
                            personal data, such as name and associated email addresses, will be deleted or anonymized.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>The Purposes of Processing</Text>
                        <Text style={styles.paragraph}>
                            The Data concerning the User is collected to allow the Owner to provide its Service, comply
                            with legal obligations, respond to enforcement requests, protect its rights and interests,
                            detect any malicious or fraudulent activity, as well as the following:
                        </Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Registration and Authentication</Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Analytics</Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Location-based Interactions</Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Personalization</Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Communication</Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>Security and Compliance</Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Analytics</Text>
                        <Text style={styles.paragraph}>
                            The services contained in this section enable the Owner to monitor and analyze web traffic and
                            can be used to keep track of User behavior.
                        </Text>

                        <Text style={styles.subSectionTitle}>Google Analytics 4 (Google Ireland Limited)</Text>
                        <Text style={styles.paragraph}>
                            Google Analytics 4 is a web analysis service provided by Google Ireland Limited ("Google").
                            Google utilizes the Data collected to track and examine the use of this Application, prepare
                            reports on its activities, and share them with other Google services.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Location-based Interactions</Text>
                        <Text style={styles.paragraph}>
                            This Application may collect, use, and share User location Data to provide location-based
                            services. Most browsers and devices provide tools to opt out of this feature by default. If
                            explicit authorization has been provided, the User's location data may be tracked by this
                            Application.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>The Rights of Users</Text>
                        <Text style={styles.paragraph}>
                            Users may exercise certain rights regarding their Data processed by the Owner.
                        </Text>
                        <Text style={styles.paragraph}>
                            In particular, Users have the right to do the following, to the extent permitted by law:
                        </Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Withdraw their consent at any time.</Text> Users have the right to withdraw
                                consent where they have previously given their consent to the processing of their Personal
                                Data.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Access their Data.</Text> Users have the right to learn if Data is being processed
                                by the Owner, obtain disclosure regarding certain aspects of the processing, and obtain a
                                copy of the Data undergoing processing.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Verify and seek rectification.</Text> Users have the right to verify the accuracy
                                of their Data and ask for it to be updated or corrected.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Restrict the processing of their Data.</Text> Users have the right to restrict the
                                processing of their Data. In this case, the Owner will not process their Data for any
                                purpose other than storing it.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Have their Personal Data deleted.</Text> Users have the right to obtain the
                                erasure of their Data from the Owner.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Lodge a complaint.</Text> Users have the right to bring a claim before their
                                competent data protection authority.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>How to Exercise These Rights</Text>
                        <Text style={styles.paragraph}>
                            Any requests to exercise User rights can be directed to the Owner through the contact details
                            provided in this document. Such requests are free of charge and will be answered by the Owner
                            as early as possible and always within one month.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Changes to This Privacy Policy</Text>
                        <Text style={styles.paragraph}>
                            The Owner reserves the right to make changes to this privacy policy at any time by notifying
                            its Users on this page and possibly within this Application and/or—as far as technically and
                            legally feasible—sending a notice to Users via any contact information available to the Owner.
                            It is strongly recommended to check this page often, referring to the date of the last
                            modification listed at the bottom.
                        </Text>
                        <Text style={styles.paragraph}>
                            Should the changes affect processing activities performed on the basis of the User's consent,
                            the Owner shall collect new consent from the User, where required.
                        </Text>
                    </View>

                    <View style={styles.lastUpdated}>
                        <Text style={styles.lastUpdatedText}>Latest Update: Sep 16, 2024</Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 15,
        paddingHorizontal: 20,
        backgroundColor: '#1A1A1A',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    backButton: {
        padding: 5,
    },
    backButtonText: {
        color: '#D35400',
        fontSize: 16,
    },
    placeholder: {
        width: 40,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#D35400',
        marginBottom: 10,
    },
    section: {
        marginBottom: 25,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
    },
    subSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#BBBBBB',
        marginTop: 10,
        marginBottom: 8,
    },
    paragraph: {
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
        marginBottom: 10,
    },
    listItem: {
        flexDirection: 'row',
        marginBottom: 10,
    },
    listItemBullet: {
        color: '#D35400',
        fontSize: 16,
        marginRight: 10,
        lineHeight: 20,
    },
    listItemText: {
        flex: 1,
        fontSize: 14,
        color: '#FFFFFF',
        lineHeight: 20,
    },
    bold: {
        fontWeight: 'bold',
        color: '#D35400',
    },
    lastUpdated: {
        marginTop: 30,
        marginBottom: 40,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    lastUpdatedText: {
        fontSize: 14,
        color: '#999999',
        textAlign: 'center',
    },
});

export default PrivacyPolicyScreen;