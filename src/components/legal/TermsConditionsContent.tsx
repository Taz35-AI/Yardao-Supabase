// src/components/legal/TermsConditionsContent.tsx
import React from 'react'

export const TermsConditionsContent: React.FC = () => {
  return (
    <div className="space-y-6 text-gray-700 dark:text-gray-300">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        <p><strong>Last Updated:</strong> November 14, 2025</p>
        <p><strong>Effective Date:</strong> November 14, 2025</p>
      </div>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">1. Agreement to Terms</h2>
        <p>
          By accessing or using Yardao ("the Service"), you agree to be bound by these Terms & Conditions. 
          If you disagree with any part of these terms, you may not use our Service.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">2. Description of Service</h2>
        <p>Yardao is a fleet management application that allows users to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Track vehicle check-ins and check-outs</li>
          <li>Monitor MOT, tax, and insurance status</li>
          <li>Manage service bookings and maintenance</li>
          <li>Organize vehicles across multiple branches</li>
          <li>Import/export vehicle data</li>
        </ul>
        <p className="mt-3 font-semibold">
          The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">3. Data Accuracy & User Responsibility</h2>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-300 dark:border-amber-700 mb-4">
          <p className="font-semibold text-amber-900 dark:text-amber-300 mb-2">YOU ARE SOLELY RESPONSIBLE FOR:</p>
          <ul className="list-disc pl-6 space-y-1 text-amber-800 dark:text-amber-300">
            <li>The accuracy of all vehicle data you enter</li>
            <li>Verifying MOT, tax, and insurance information</li>
            <li>Ensuring compliance with legal requirements</li>
            <li>Any decisions made based on data in Yardao</li>
          </ul>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-300 dark:border-red-700">
          <p className="font-semibold text-red-900 dark:text-red-300 mb-2">WE DO NOT:</p>
          <ul className="list-disc pl-6 space-y-1 text-red-800 dark:text-red-300">
            <li>Verify the accuracy of user-entered data</li>
            <li>Monitor MOT, tax, or insurance expiry independently</li>
            <li>Guarantee that notifications will be delivered</li>
            <li>Take responsibility for missed deadlines or expired documents</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">4. Limitation of Liability</h2>
        
        <p className="font-semibold text-red-900 dark:text-red-300 mb-3">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW:
        </p>

        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2">We Are NOT Liable For:</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Lost profits, revenue, or business opportunities</li>
          <li>Data loss or corruption (maintain your own backups)</li>
          <li>Missed MOT, tax, or insurance renewals</li>
          <li>Fines, penalties, or legal consequences</li>
          <li>Vehicle accidents, damage, or theft</li>
          <li>Service interruptions or downtime</li>
          <li>Any indirect, incidental, or consequential damages</li>
        </ul>

        <h3 className="font-semibold text-[#025940] dark:text-teal-400 mb-2 mt-4">Maximum Liability</h3>
        <p>
          Our total liability to you for any claim shall not exceed the amount you paid for the Service 
          in the 12 months preceding the claim.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-[#012619] dark:text-white mb-3">5. Contact Information</h2>
        <div className="bg-[#C5D9D0]/20 dark:bg-teal-900/20 p-4 rounded-lg border border-[#72A68E] dark:border-teal-700">
          <p><strong>Email:</strong> support@yardao.com</p>
          <p><strong>Address:</strong> Office 183, 18 Young St, UNIT LGE, Edinburgh, EH2 4JB, Scotland</p>
        </div>
      </section>

      <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border-l-4 border-[#025940]">
        <p className="font-semibold text-[#012619] dark:text-white">
          BY USING YARDAO, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS & CONDITIONS.
        </p>
      </div>
    </div>
  )
}