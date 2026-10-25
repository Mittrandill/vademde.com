import type { legal as tr } from '../tr/legal';
import type { Messages } from '../../types';

// Faithful translation of the existing Turkish text; the policy's revision date is unchanged.
export const legal: Messages<typeof tr> = {
  updated: 'LAST UPDATED · AUGUST 11, 2026',
  contact: 'For requests and questions:',
  privacy: {
    title: 'Privacy and KVKK',
    sections: {
      s1: {
        title: '1. Data Controller',
        body: 'Under the Turkish Personal Data Protection Law No. 6698 ("KVKK"), your personal data is processed as described below by Turgut Akın Kaya, acting as the data controller (an individual operating under the "DoTa Medya" brand), based in Çeşme, İzmir, Türkiye (the full address for service is provided on request). Contact: info@vademde.com, 0543 203 53 09.',
      },
      s2: {
        title: '2. Categories of Personal Data Collected',
        body: '• Account data: name and email address; if you use Sign in with Apple, the identity information shared by Apple.\n• Financial document data: images of checks, promissory notes, invoices, loan repayment schedules, credit card statements and similar documents you scan, and fields read from them, such as amounts, dates, parties, IBANs and document numbers.\n• Financial records you enter manually: income, expenses, payables, receivables, accounts, categories and person/business details.\n• Subscription and purchase data: your plan choice and subscription status. We do not store payment details such as card numbers; payments are processed directly through the Apple App Store.\n• Device and usage data: app version, operating system, error logs and notification permission status.\n• Usage analytics (only if you enable the Usage analytics switch in Settings > Privacy): which app screens and subscription steps (viewing the subscription screen, selecting a plan and starting payment) are used, the event time, app version and iOS/Android information. These events are linked to your account; amounts, document contents and person or business details are never included in them.',
      },
      s3: {
        title: '3. Purposes of Processing',
        body: 'To create your account, authenticate you and manage your session; classify the documents you scan, extract fields such as amounts, dates and parties using AI-assisted optical character recognition (OCR), and present them for your approval; create payable, receivable, income, expense and due-date records from the data you approve, and manage the due-date calendar and reminder notifications; manage your subscription plan and OCR allowance and verify purchases; keep the service secure, detect errors and provide technical support; and fulfill our legal obligations. The AI processing your documents never creates a final financial record on its own; every OCR result is presented for your review and approval before it becomes a record. If you enable usage analytics, it is used to understand which features are used and where you encounter difficulties in the subscription steps so that we can improve the product; it is not used for advertising or profiling and is not shared with third parties.',
      },
      s4: {
        title: '4. Legal Basis',
        body: 'Your personal data is processed under Article 5(2) of the KVKK on the legal grounds of being directly related to the establishment or performance of a contract and the legitimate interests of the data controller. The transfer of document images to an AI service based abroad (see Section 5) relies on the separate explicit consent obtained within the app under Article 9 of the KVKK. Usage analytics relies solely on the consent you explicitly give in Settings under Article 5(1) of the KVKK; you may withdraw it at any time using the same switch, after which no new events are collected.',
      },
      s5: {
        title: '5. Who We Share Your Data With',
        body: 'We do not sell your data to third parties for marketing purposes. To provide the service, data is shared with the following providers only to the extent necessary and for the relevant purpose:\n• Supabase Inc. — database, authentication and file storage infrastructure; your account and financial records are stored in isolation using workspace-specific access policies (row-level security).\n• Google (Gemini API) — your document images are sent to this service by the server solely to extract fields and only after your approval; the access key is never embedded in the mobile app.\n• RevenueCat and Apple App Store — used to verify and manage your subscription status.\n• Apple (Sign in with Apple and notifications) — enables sign-in and notifications.\nThese providers may host servers outside Türkiye; in that case, the transfer relies on your explicit consent under Article 9 of the KVKK. Unless legally required, your data is not shared with third parties outside this list.',
      },
      s6: {
        title: '6. Data Security',
        body: '• Each workspace’s data is fully isolated from other workspaces through row-level security (RLS) policies.\n• Your documents are kept in private storage that is not publicly accessible; access is provided only through short-lived signed links.\n• Your session information is kept in encrypted secure storage on your device (Keychain/Keystore).\n• Service keys and model API keys are never embedded in the client app; document analysis runs only on the server.\n• Data is encrypted in transit (TLS).',
      },
      s7: {
        title: '7. Data Retention',
        body: 'Your financial records (structured data such as amounts, dates and party details) are retained unless you delete the relevant record or workspace. The original image of a scanned document is retained according to your preference in Profile > Privacy: if "Keep scanned documents" is enabled, it is kept until you delete it; if disabled (the default), it is automatically deleted as soon as AI analysis finishes. When you delete your account, all data, including documents, is permanently deleted, except records that must be retained by law. Usage analytics events are retained until your account is deleted and are deleted with it.',
      },
      s8: {
        title: '8. Your Rights (Article 11 of the KVKK)',
        body: 'Under Article 11 of the KVKK, you have the right to learn whether your personal data is being processed; request information if it has been processed; learn the purpose of processing and whether the data is used for that purpose; know the third parties to whom it is transferred domestically or abroad; request correction of incomplete or inaccurate data; request deletion or destruction when the conditions in Article 7 of the KVKK are met; request that these actions be notified to third parties to whom the data was transferred; object to an adverse result arising from analysis exclusively through automated systems; and claim compensation if you suffer damage. To exercise these rights, you may send a written request to info@vademde.com with information verifying your identity; your request will be resolved within 30 days at the latest. You may also directly delete your account and all data at any time within the app (Profile > Delete My Account and Data).',
      },
      s9: {
        title: '9. Children’s Privacy',
        body: 'The service is not directed at people under 18, and we do not knowingly collect personal data from children. If we become aware that we have collected data from a user under 18, we delete it.',
      },
      s10: {
        title: '10. Policy Changes',
        body: 'We may update this policy from time to time. We announce significant changes through in-app notifications or email. The current version is always published in the app and at www.vademde.com/gizlilik.',
      },
      s11: {
        title: '11. Contact',
        body: 'For privacy questions: info@vademde.com or 0543 203 53 09.',
      },
    },
  },
  terms: {
    title: 'Terms of Service',
    sections: {
      s1: {
        title: '1. Parties and Acceptance',
        body: 'These Terms of Service ("Terms") govern the use of the Vademde mobile app and the www.vademde.com website (the "Service") provided by Turgut Akın Kaya, an individual operating under the "DoTa Medya" brand ("Vademde", "we"). By downloading the Service, creating an account or using it, you are deemed to have accepted these Terms and the Privacy Policy and KVKK Privacy Notice.',
      },
      s2: {
        title: '2. Description of the Service',
        body: 'Vademde is a personal and business finance tracking app that converts checks, promissory notes, invoices, loan repayment schedules and other financial documents into payable, receivable, income, expense and due-date records with user approval. Vademde is not an investment advisory, accounting, legal, tax advisory, banking or payment service; it does not execute, hold or guarantee any payment on behalf of the parties. Reports and summaries provided by the app are for information only; you are advised to consult a qualified professional before making financial, legal or tax decisions.',
      },
      s3: {
        title: '3. Account Creation and Security',
        body: 'To use the Service, you must create an account using Sign in with Apple or email. You are responsible for keeping your account details confidential and for activities carried out through your account. If you suspect unauthorized access, you must notify us at info@vademde.com. You may use the Service only if you are over 18. If you invite other users to a workspace, you are responsible for the data you share with them.',
      },
      s4: {
        title: '4. Document Scanning, OCR and User Approval',
        body: 'Amounts, dates, parties and similar fields extracted from your scanned documents using AI never become final financial records without your approval. Fields read with low confidence are clearly marked in the app; it is your responsibility to check their accuracy before approving or correcting them. You are responsible for the accuracy and completeness of records you approve. Vademde does not guarantee the accuracy of OCR results or data you approve and cannot be held responsible for incorrect records, missed payments or similar consequences caused by errors in OCR or AI output.',
      },
      s5: {
        title: '5. Workspaces',
        body: 'Personal and business workspaces are fully isolated from each other. When you are added as a team member to a business workspace, you can access its data; the workspace owner is responsible for that access.',
      },
      s6: {
        title: '6. Subscription Plans and Payment',
        body: 'Vademde offers different subscription plans: Free, Vademde Plus and Vademde Business. Paid plans are sold only through in-app purchases (IAP) on the Apple App Store; pricing and duration are shown on the purchase screen and App Store listing. The following conditions apply to auto-renewable subscriptions: payment is charged to your Apple ID account when you confirm the purchase; the subscription renews automatically unless you turn off auto-renewal at least 24 hours before the current period ends; the renewal fee is charged to your account 24 hours before the end of the current period; you can manage your subscription and turn off auto-renewal at any time in Settings > Apple ID > Subscriptions on your device; if a free trial is offered, any unused portion is forfeited when you purchase a paid subscription. Vademde does not store your payment details, such as card numbers; this information is processed directly by Apple.',
      },
      s7: {
        title: '7. Cancellation and Refunds',
        body: 'All purchases and refunds are handled through the Apple App Store; refund requests are subject to Apple’s own policies and https://reportaproblem.apple.com. Vademde cannot issue refunds directly outside the App Store.',
      },
      s8: {
        title: '8. Rules of Use',
        body: 'When using the Service, you agree not to use it for illegal purposes or in ways that infringe the rights of others; upload another person’s documents or identity information without permission; attempt to bypass the Service’s security, reverse engineer it or access its source code; or abuse or overload the Service using automated tools.',
      },
      s9: {
        title: '9. Intellectual Property',
        body: 'The Vademde name, logo, design, software and app content (excluding documents uploaded by users) belong to Turgut Akın Kaya (DoTa Medya) and are protected by copyright. You may use the Service only for your legitimate personal or business needs in accordance with these Terms. The documents you upload and financial data you enter belong to you; you may delete them at any time (see the Privacy Policy). You permit us to use this data to the extent necessary to provide the Service, including processing, storage and OCR analysis.',
      },
      s10: {
        title: '10. Service Changes and Interruptions',
        body: 'We may change, suspend or discontinue features to improve the Service, keep it secure or meet legal requirements. We try to give reasonable advance notice of interruptions other than scheduled maintenance.',
      },
      s11: {
        title: '11. Limitation of Liability',
        body: 'The Service is provided "as is". To the fullest extent permitted by applicable law, we are not liable for indirect, incidental or consequential losses resulting from inaccurate OCR results, service interruptions, data loss or financial decisions based on data approved by the user. This limitation does not apply where intent or gross negligence gives rise to liability by law.',
      },
      s12: {
        title: '12. Account Termination',
        body: 'You may directly delete your account at any time within the app (Profile > Delete My Account and Data). We reserve the right to suspend or terminate your account if you violate these Terms; we will notify you if this happens.',
      },
      s13: {
        title: '13. Governing Law and Jurisdiction',
        body: 'These Terms are governed by the laws of the Republic of Türkiye. The courts and enforcement offices of İzmir, and the relevant consumer arbitration committees and consumer courts for consumer transactions, have jurisdiction over disputes arising from these Terms.',
      },
      s14: {
        title: '14. Changes',
        body: 'We may update these Terms from time to time. We announce significant changes through in-app notifications and email. The current version is always published in the app and at www.vademde.com/kullanim-sartlari.',
      },
      s15: {
        title: '15. Contact',
        body: 'For questions: info@vademde.com or 0543 203 53 09.',
      },
    },
  },
};
