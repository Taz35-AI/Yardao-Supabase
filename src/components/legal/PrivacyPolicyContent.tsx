// src/components/legal/PrivacyPolicyContent.tsx
import React from 'react'

export const PrivacyPolicyContent: React.FC = () => {
  return (
    <div className="space-y-6 text-gray-700 dark:text-gray-300">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        <p><strong>Last Updated:</strong> November 14, 2025</p>
        <p><strong>Effective Date:</strong> November 14, 2025</p>
      </div>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">1. Introduction</h2>
        <p>
          Yardao ("we," "our," "us") provides a fleet management application for tracking vehicles, 
          managing service bookings, and organizing yard operations. This Privacy Policy explains 
          how we collect, use, and protect your information.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">2. Information We Collect</h2>
        
        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2">Account Information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Email address</li>
          <li>Display name</li>
          <li>Organization name</li>
          <li>Password (encrypted)</li>
        </ul>

        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2 mt-4">Vehicle Data</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Vehicle registrations, make, model, color, size</li>
          <li>MOT/tax expiry dates</li>
          <li>Mileage, condition, service history</li>
          <li>Location and branch assignments</li>
          <li>Contract and insurance status</li>
        </ul>

        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2 mt-4">Usage Information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Device information (type, operating system)</li>
          <li>IP address</li>
          <li>Browser type</li>
          <li>App usage patterns and interaction logs</li>
        </ul>

        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2 mt-4">Cookies & Local Storage</h3>
        <p>We use cookies and local storage for:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Authentication and session management</li>
          <li>App preferences (theme, notifications)</li>
          <li>PWA functionality and offline access</li>
          <li>Performance optimization</li>
        </ul>
        <p className="mt-2 text-sm">
          You can disable cookies in your browser settings, but this may limit app functionality.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">3. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Provide and maintain the fleet management service</li>
          <li>Authenticate users and secure accounts</li>
          <li>Send notifications (MOT expiry, service bookings)</li>
          <li>Improve app performance and features</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">4. Data Sharing</h2>
        <p>
          We <strong>DO NOT</strong> sell your data. We share information only with:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Firebase/Google Cloud:</strong> Infrastructure and authentication</li>
          <li><strong>Service providers:</strong> Essential app functionality only</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">5. Data Security</h2>
        <p>
          We implement industry-standard security measures including encryption, secure authentication, 
          and regular backups. However, <strong>no system is 100% secure</strong>. You use Yardao at your own risk.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">6. Data Retention</h2>
        <p>
          We retain your data while your account is active. Upon account deletion, data is removed 
          within 30 days, except where legally required to retain records.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Access your data</li>
          <li>Correct inaccurate information</li>
          <li>Request data deletion</li>
          <li>Export your data</li>
          <li>Opt-out of notifications</li>
        </ul>
        <p className="mt-2">
          Contact us at <strong>support@yardao.com</strong> to exercise these rights.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">8. Third-Party Services</h2>
        <p>Yardao uses:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Firebase (Google) for backend services</li>
          <li>Cloud messaging for push notifications</li>
        </ul>
        <p className="mt-2">
          These services have their own privacy policies. We are not responsible for their practices.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">9. Children's Privacy</h2>
        <p>
          Yardao is not intended for users under 18. We do not knowingly collect data from minors.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">10. Changes to This Policy</h2>
        <p>
          We may update this policy. Continued use after changes constitutes acceptance of the updated terms.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">11. Contact Information</h2>
        <div className="bg-[#C5D9D0]/20 dark:bg-teal-900/20 p-4 rounded-lg border border-[#72A68E] dark:border-teal-700">
          <p><strong>Email:</strong> support@yardao.com</p>
          <p><strong>Address:</strong> Office 183, 18 Young St, UNIT LGE, Edinburgh, EH2 4JB, Scotland</p>
        </div>
      </section>

      <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border-l-4 border-[#025940]">
        <p className="font-semibold text-[#012619] dark:text-white">
          By using Yardao, you acknowledge that you have read and understood this Privacy Policy.
        </p>
      </div>
    </div>
  )
}