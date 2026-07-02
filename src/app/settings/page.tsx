// src/app/settings/page.tsx
// ✅ COMPLETE: Added Companies tab for invoice company management
// ✅ UPDATED: Added Insurance Policies tab

'use client'

import React, { useState, useEffect } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Navigation } from '@/components/Navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { userProfileService } from '@/lib/firestore'
import { isAdminRole } from '@/lib/permissions'
import { useT } from '@/lib/i18n'
import { UserProfile } from '@/types'
import { 
  Settings as SettingsIcon,
  Shield,
  Bell,
  Database,
  ChevronRight,
  ChevronDown,
  Palette,
  Users,
  FileText,
  Building2,
  Package,
  Wrench,
  ExternalLink,
  GitBranch,
  User as UserIcon,
  Receipt,
  Gauge
} from 'lucide-react'
import dynamic from 'next/dynamic'

// Loading spinner with a translatable label
function LoadingLabel({ labelKey }: { labelKey?: string }) {
  const t = useT()
  return (
    <div className="flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#025940]"></div>
      {labelKey && <span className="ml-2 text-sm text-[#025940]">{t(labelKey)}</span>}
    </div>
  )
}

// Lazy load User Settings
const UserSettings = dynamic(
  () => import('@/components/settings/UserSettings').then(mod => ({ default: mod.UserSettings })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingUserSettings" />
  }
)

// Lazy load Condition Management
const ConditionManagement = dynamic(
  () => import('@/components/admin/ConditionManagement').then(mod => ({ default: mod.ConditionManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel />
  }
)

// Lazy load Contract Management
const ContractManagement = dynamic(
  () => import('@/components/admin/ContractManagement').then(mod => ({ default: mod.ContractManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel />
  }
)

// Lazy load Supplier Management
const SupplierManagement = dynamic(
  () => import('@/components/admin/SupplierManagement').then(mod => ({ default: mod.SupplierManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel />
  }
)

// ✅ NEW: Lazy load Company Management
const CompanyManagement = dynamic(
  () => import('@/components/settings/CompanyManagement').then(mod => ({ default: mod.CompanyManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingCompanies" />
  }
)

// ✅ NEW: Lazy load Insurance Policies Management
const InsurancePoliciesManagement = dynamic(
  () => import('@/components/settings/InsurancePoliciesManagement').then(mod => ({ default: mod.InsurancePoliciesManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingInsurance" />
  }
)

// Lazy load User Management
const UserManagement = dynamic(
  () => import('@/components/admin/UserManagement'),
  {
    ssr: false,
    loading: () => <LoadingLabel />
  }
)

// Lazy load External Garage Management
const ExternalGarageManagement = dynamic(
  () => import('@/components/settings/ExternalGarageManagement').then(mod => ({ default: mod.ExternalGarageManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingExtGarages" />
  }
)

// Lazy load Branch Management
const BranchManagement = dynamic(
  () => import('@/components/settings/BranchManagement').then(mod => ({ default: mod.BranchManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingBranches" />
  }
)

// Lazy load Data Management (CSV exports)
const DataManagement = dynamic(
  () => import('@/components/settings/DataManagement').then(mod => ({ default: mod.DataManagement })),
  {
    ssr: false,
    loading: () => <LoadingLabel labelKey="settings.page.loadingData" />
  }
)

// Lazy load Check-in & Servicing settings
const CheckInServiceSettings = dynamic(
  () => import('@/components/settings/CheckInServiceSettings').then(mod => ({ default: mod.CheckInServiceSettings })),
  {
    ssr: false,
    loading: () => <LoadingLabel />
  }
)

type SettingsTab = 'user' | 'organization' | 'data'
// ✅ UPDATED: Added 'companies' and 'insurance-policies' to OrganizationSubTab
type OrganizationSubTab = 'branches' | 'conditions' | 'contracts' | 'suppliers' | 'companies' | 'insurance-policies' | 'external-garages' | 'check-in' | 'users' | 'general'

export default function SettingsPage() {
  const t = useT()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('user')
  const [activeOrgTab, setActiveOrgTab] = useState<OrganizationSubTab>('branches')
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab === 'branches') {
      setActiveTab('organization')
      setActiveOrgTab('branches')
    } else if (tab === 'insurance-policies') {
      // ✅ NEW: support direct link to insurance policies tab
      setActiveTab('organization')
      setActiveOrgTab('insurance-policies')
    } else if (tab === 'user') {
      setActiveTab('user')
    }
  }, [])

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user) return
      try {
        const profile = await userProfileService.getProfile(user.uid)
        setUserProfile(profile)
      } finally {
        setLoading(false)
      }
    }
    loadUserProfile()
  }, [user])

  const settingsTabs = [
    {
      id: 'user' as const,
      label: t('settings.page.tabUser'),
      description: t('settings.page.tabUserDesc'),
      icon: UserIcon,
      requiresAdmin: false
    },
    {
      id: 'organization' as const,
      label: t('settings.page.tabOrg'),
      description: t('settings.page.tabOrgDesc'),
      icon: Building2,
      requiresAdmin: true
    },
    {
      id: 'data' as const,
      label: t('settings.page.tabData'),
      description: t('settings.page.tabDataDesc'),
      icon: Database,
      requiresAdmin: true
    }
  ]

  // ✅ UPDATED: Added Companies and Insurance Policies tabs
  const organizationTabs = [
    {
      id: 'branches' as const,
      label: t('settings.page.orgBranches'),
      description: t('settings.page.orgBranchesDesc'),
      icon: GitBranch,
      component: BranchManagement
    },
    {
      id: 'conditions' as const,
      label: t('settings.page.orgConditions'),
      description: t('settings.page.orgConditionsDesc'),
      icon: Palette,
      component: ConditionManagement
    },
    {
      id: 'contracts' as const,
      label: t('settings.page.orgContracts'),
      description: t('settings.page.orgContractsDesc'),
      icon: FileText,
      component: ContractManagement
    },
    {
      id: 'suppliers' as const,
      label: t('settings.page.orgSuppliers'),
      description: t('settings.page.orgSuppliersDesc'),
      icon: Package,
      component: SupplierManagement
    },
    {
      id: 'companies' as const,
      label: t('settings.page.orgCompanies'),
      description: t('settings.page.orgCompaniesDesc'),
      icon: Receipt,
      component: CompanyManagement
    },
    // ✅ NEW: Insurance Policies tab
    {
      id: 'insurance-policies' as const,
      label: t('settings.page.orgInsurance'),
      description: t('settings.page.orgInsuranceDesc'),
      icon: Shield,
      component: InsurancePoliciesManagement
    },
    {
      id: 'external-garages' as const,
      label: t('settings.page.orgExtGarages'),
      description: t('settings.page.orgExtGaragesDesc'),
      icon: Wrench,
      component: ExternalGarageManagement
    },
    {
      id: 'check-in' as const,
      label: t('checkInSettings.tabLabel'),
      description: t('checkInSettings.tabDesc'),
      icon: Gauge,
      component: CheckInServiceSettings
    },
    {
      id: 'users' as const,
      label: t('settings.page.orgUsers'),
      description: t('settings.page.orgUsersDesc'),
      icon: Users,
      component: UserManagement
    },
    {
      id: 'general' as const,
      label: t('settings.page.orgGeneral'),
      description: t('settings.page.orgGeneralDesc'),
      icon: Shield,
      component: null
    }
  ]

  const availableTabs = settingsTabs.filter(tab =>
    !tab.requiresAdmin || isAdminRole(userProfile?.role)
  )

  const activeTabData = availableTabs.find(tab => tab.id === activeTab) || availableTabs[0]

  const handleTabChange = (tabId: SettingsTab) => {
    setActiveTab(tabId)
    setShowMobileMenu(false)
    if (tabId === 'organization') {
      setActiveOrgTab('branches')
    }
  }

  const handleOrgTabChange = (subTabId: OrganizationSubTab) => {
    setActiveOrgTab(subTabId)
  }

  const renderOrganizationComponent = () => {
    const activeOrgTabData = organizationTabs.find(tab => tab.id === activeOrgTab)
    if (activeOrgTabData?.component) {
      const Component = activeOrgTabData.component
      return <Component />
    }

    return (
      <div className="p-3 sm:p-4 lg:p-6 max-w-full overflow-hidden">
        <div className="mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
            {t('settings.page.generalHeading')}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('settings.page.generalIntro')}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-[#025940]" />
              <span>{t('settings.page.orgInfo')}</span>
            </CardTitle>
            <CardDescription>
              {t('settings.page.orgInfoDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.page.orgName')}
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
                  <span className="text-gray-900 dark:text-white">
                    {userProfile?.organizationName || t('settings.page.orgNameFallback')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.page.orgChangeHint')}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.page.orgId')}
                </label>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
                  <span className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                    {userProfile?.organizationId || t('settings.page.notSet')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.page.availableFeatures')}</CardTitle>
            <CardDescription>
              {t('settings.page.availableFeaturesDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizationTabs.filter(tab => tab.id !== 'general').map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleOrgTabChange(tab.id)}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-[#72A68E] dark:hover:border-[#025940] hover:bg-[#C5D9D0]/20 dark:hover:bg-[#025940]/20 transition-all text-left"
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <tab.icon className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {tab.label}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {tab.description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'user':
        return (
          <div className="p-3 sm:p-4 lg:p-6 max-w-full overflow-hidden">
            <UserSettings />
          </div>
        )
      case 'organization':
        return (
          <div className="h-full">
            <div className="border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6">
              <div className="flex space-x-8 overflow-x-auto">
                {organizationTabs.map((subTab) => (
                  <button
                    key={subTab.id}
                    onClick={() => handleOrgTabChange(subTab.id)}
                    className={`
                      flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                      ${activeOrgTab === subTab.id
                        ? 'border-[#025940] text-[#025940] dark:text-[#72A68E]'
                        : 'border-transparent text-gray-500 hover:text-[#025940] dark:text-gray-400 dark:hover:text-[#72A68E]'
                      }
                    `}
                  >
                    <subTab.icon className="w-4 h-4" />
                    {subTab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-full">
              {renderOrganizationComponent()}
            </div>
          </div>
        )
      case 'data':
        return <DataManagement />
      default:
        return (
          <div className="p-4 sm:p-6 text-center text-gray-500 dark:text-gray-400">
            {t('settings.page.selectOption')}
          </div>
        )
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
          <Navigation />
          <div className="pt-0">
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#025940]"></div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
        <Navigation />
        
        <div className="pt-0">
          <div className="w-full px-2 sm:px-4 lg:px-8 py-1">
            <style jsx global>{`
              @media (max-width: 640px) {
                .contract-color-picker { display:flex; flex-wrap:wrap; gap:6px; max-width:100%; }
                .contract-color-picker > * { flex-shrink:0; width:28px; height:28px; }
                .contract-row, .condition-row, .user-row { display:flex; flex-direction:column; gap:8px; padding:10px; align-items:flex-start; }
                .contract-row .contract-info, .condition-row .condition-info, .user-row .user-info { display:flex; flex-direction:column; align-items:flex-start; width:100%; min-width:0; }
                .contract-row .contract-actions, .condition-row .condition-actions, .user-row .user-actions { display:flex; flex-direction:row; gap:6px; width:100%; justify-content:flex-start; flex-wrap:wrap; }
                .contract-row .contract-actions > *, .condition-row .condition-actions > *, .user-row .user-actions > * { font-size:12px; padding:4px 8px; min-width:0; flex-shrink:0; }
                .password-reset-text { font-size:11px; padding:2px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px; display:inline-block; }
                .user-card { display:flex; flex-direction:column; gap:8px; padding:10px; width:100%; }
                .user-card-header { display:flex; align-items:flex-start; gap:10px; width:100%; }
                .user-card-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
                .user-card-name { font-weight:600; font-size:14px; word-break:break-word; }
                .user-card-email { font-size:12px; color:#6b7280; word-break:break-all; }
                .user-card-meta { font-size:11px; color:#9ca3af; }
                .user-card-status { display:flex; flex-direction:column; gap:6px; width:100%; margin-top:6px; }
                .user-card-actions { display:flex; gap:6px; flex-wrap:wrap; width:100%; }
                .contract-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:500; max-width:100%; word-break:break-word; }
                .contract-badge-color { width:12px; height:12px; border-radius:50%; flex-shrink:0; }
                .condition-item { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:8px; }
                .condition-item-header { display:flex; align-items:center; gap:8px; width:100%; }
                .condition-item-content { flex:1; min-width:0; }
                .condition-item-actions { display:flex; gap:6px; width:100%; flex-wrap:wrap; }
                .settings-content * { max-width:100%; word-wrap:break-word; overflow-wrap:break-word; }
                .mobile-button { font-size:12px; padding:6px 12px; white-space:nowrap; min-width:auto; }
                .mobile-input { width:100%; max-width:100%; font-size:14px; }
              }
            `}</style>
            
            <div className="text-center mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#012619] dark:text-white mb-2">
                {t('settings.page.title')}
              </h1>
              <p className="text-sm text-[#025940] dark:text-gray-300">
                {t('settings.page.subtitle')}
              </p>
            </div>

            <div className="w-full">
              <div className="lg:hidden mb-4">
                <Card>
                  <CardContent className="p-0">
                    <button
                      onClick={() => setShowMobileMenu(!showMobileMenu)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <activeTabData.icon className="w-5 h-5 text-[#025940] dark:text-[#72A68E]" />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {activeTabData.label}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {activeTabData.description}
                          </div>
                        </div>
                      </div>
                      {showMobileMenu ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    
                    {showMobileMenu && (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        {availableTabs.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                              activeTab === tab.id
                                ? 'bg-[#C5D9D0]/30 dark:bg-[#025940]/20 border-l-2 border-[#025940]'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <tab.icon className={`w-5 h-5 ${
                              activeTab === tab.id 
                                ? 'text-[#025940] dark:text-[#72A68E]' 
                                : 'text-gray-400'
                            }`} />
                            <div>
                              <div className={`font-medium ${
                                activeTab === tab.id 
                                  ? 'text-[#025940] dark:text-[#72A68E]' 
                                  : 'text-gray-900 dark:text-white'
                              }`}>
                                {tab.label}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {tab.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="lg:grid lg:grid-cols-5 lg:gap-6">
                <div className="hidden lg:block lg:col-span-1">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <SettingsIcon className="w-4 h-4" />
                        {t('settings.page.menu')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-1">
                        {availableTabs.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-all ${
                              activeTab === tab.id
                                ? 'bg-[#C5D9D0]/30 dark:bg-[#025940]/20 text-[#025940] dark:text-[#72A68E] border border-[#72A68E] dark:border-[#025940]'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <tab.icon className={`w-4 h-4 flex-shrink-0 ${
                              activeTab === tab.id 
                                ? 'text-[#025940] dark:text-[#72A68E]' 
                                : 'text-gray-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {tab.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {tab.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-4">
                  <Card className="min-h-[600px]">
                    <CardContent className="p-0 h-full settings-content">
                      {renderActiveComponent()}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}