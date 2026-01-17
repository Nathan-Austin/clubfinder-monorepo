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

type TermsScreenNavigationProp = StackNavigationProp<any>;

const TermsScreen = () => {
    const navigation = useNavigation<TermsScreenNavigationProp>();

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
                <Text style={styles.headerTitle}>Terms and Conditions</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.scrollView}>
                <View style={styles.content}>
                    <Text style={styles.title}>Terms and Conditions of Use for Clubfindr</Text>
                    <Text style={styles.effectiveDate}>Effective Date: September 20, 2024</Text>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Introduction</Text>
                        <Text style={styles.paragraph}>
                            Welcome to Clubfindr ("we," "us," or "our"). These Terms and Conditions ("Terms") govern your
                            access to and use of our website and application, including any content, functionality, and services offered on or through the Website and Application (collectively, the "Service"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Service.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
                        <Text style={styles.paragraph}>
                            By registering for and/or using the Service in any manner, including but not limited to
                            visiting or browsing the Website, you agree to these Terms and all other operating rules,
                            policies, and procedures that may be published from time to time on the Website.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>2. Eligibility</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Age Requirement:</Text> You must be at least 18 years old to use our Service.
                                Users under 18 may use the Service only under the supervision of a legal parent or guardian.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Compliance:</Text> You must ensure that your use of the Service complies with all
                                applicable laws and regulations.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>3. Account Registration and Security</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Registration:</Text> To access certain features of the Service, you must create an
                                account by providing accurate and complete information.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Account Security:</Text> You are responsible for maintaining the confidentiality
                                of your account login information and are fully responsible for all activities that occur
                                under your account.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Notification:</Text> You agree to immediately notify us of any unauthorized use or
                                suspected unauthorized use of your account.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>4. User Conduct</Text>
                        <Text style={styles.paragraph}>
                            You agree not to engage in any of the following prohibited activities:
                        </Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Violating Laws and Rights:</Text> You may not (a) use the Service for any illegal
                                purpose or in violation of any local, state, national, or international law; (b) violate or
                                encourage others to violate the rights of third parties.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Interference:</Text> You may not interfere with or disrupt the Service or servers
                                or networks connected to the Service.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Data Mining:</Text> You may not use any data mining, robots, or similar data
                                gathering or extraction methods.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>5. Content Ownership and Licenses</Text>
                        <Text style={styles.subSectionTitle}>User Content</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Your Content:</Text> You retain ownership of all content you submit, post, or
                                display on or through the Service ("User Content").
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>License to Us:</Text> By submitting User Content, you grant us a worldwide,
                                non-exclusive, royalty-free license to use, reproduce, modify, and display such content in
                                connection with the Service.
                            </Text>
                        </View>

                        <Text style={styles.subSectionTitle}>Clubfindr Content</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Our Content:</Text> The Service and its original content, features, and
                                functionality are and will remain the exclusive property of Clubfindr and its licensors.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Restrictions:</Text> You may not modify, distribute, reproduce, or create
                                derivative works of any portion of the Service unless expressly authorized in writing by us.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>6. Third-Party Services</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Integration with Third Parties:</Text> Our Service may integrate with third-party
                                services (e.g., Spotify, Apple Music, Deezer, SoundCloud).
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Third-Party Terms:</Text> Your use of these third-party services is subject to
                                their terms and conditions and privacy policies.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>No Endorsement:</Text> We do not endorse and are not responsible for the content,
                                products, or services on or available from third-party services.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>7. Bars, Venues, and Artists</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Information Sharing:</Text> Bars and venues may receive aggregated,
                                non-identifiable data about user interests.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Push Notifications:</Text> Bars may send push notifications through our platform
                                to users with matching genre preferences. Personal identifiers are not disclosed.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Content Responsibility:</Text> Bars, venues, and artists are responsible for the
                                content they post and must ensure compliance with all applicable laws.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>8. Privacy</Text>
                        <Text style={styles.paragraph}>
                            Your privacy is important to us. Please review our Privacy Policy for information on how we collect, use, and disclose personal information.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>9. Intellectual Property Rights</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Trademarks:</Text> All trademarks, logos, and service marks displayed on the
                                Service are our property or the property of other third parties.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Copyright Policy:</Text> We respect the intellectual property rights of others. If
                                you believe that your work has been copied in a way that constitutes copyright infringement,
                                please contact us.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>10. Disclaimers</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>No Warranty:</Text> The Service is provided on an "AS IS" and "AS AVAILABLE"
                                basis. We make no warranties, whether express or implied, regarding the Service.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>No Guarantee:</Text> We do not guarantee the accuracy, completeness, or usefulness
                                of any information on the Service.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>11. Limitation of Liability</Text>
                        <Text style={styles.paragraph}>
                            To the maximum extent permitted by law:
                        </Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Exclusion of Damages:</Text> In no event shall Clubfindr be liable for any
                                indirect, incidental, special, consequential, or punitive damages.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Cap on Liability:</Text> Our total liability to you for any damages arising from
                                or related to these Terms shall not exceed the total amount you have paid us in the past
                                twelve months.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>12. Indemnification</Text>
                        <Text style={styles.paragraph}>
                            You agree to defend, indemnify, and hold harmless Clubfindr, its affiliates, and their
                            respective directors, officers, employees, and agents from and against any claims,
                            liabilities, damages, losses, and expenses arising out of or in any way connected with your
                            access to or use of the Service.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>13. Termination</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Termination by You:</Text> You may terminate your account at any time by
                                contacting us.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Termination by Us:</Text> We may suspend or terminate your access to the Service
                                at our sole discretion, without prior notice, for any reason.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Effect of Termination:</Text> Upon termination, all rights and licenses granted to
                                you will cease immediately.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>14. Governing Law and Dispute Resolution</Text>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Governing Law:</Text> These Terms shall be governed by and construed in accordance
                                with the laws of Germany, without regard to its conflict of law provisions.
                            </Text>
                        </View>
                        <View style={styles.listItem}>
                            <Text style={styles.listItemBullet}>•</Text>
                            <Text style={styles.listItemText}>
                                <Text style={styles.bold}>Dispute Resolution:</Text> Any disputes arising out of or relating to these Terms
                                shall be resolved in the courts of Berlin, Germany.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>15. Changes to Terms</Text>
                        <Text style={styles.paragraph}>
                            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If
                            a revision is material, we will provide at least 30 days' notice prior to any new terms taking
                            effect. Your continued use of the Service after the effective date of the updated Terms
                            constitutes acceptance of the new Terms.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>16. Contact Information</Text>
                        <Text style={styles.paragraph}>
                            If you have any questions about these Terms, please contact us at:
                        </Text>
                        <Text style={styles.paragraph}>
                            Email: admin@clubfindr.com{'\n'}
                            Address:{'\n'}
                            Clubfindr{'\n'}
                            Südostallee 124{'\n'}
                            12487 Berlin, Germany
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
    effectiveDate: {
        fontSize: 14,
        color: '#BBBBBB',
        fontStyle: 'italic',
        marginBottom: 20,
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

export default TermsScreen;