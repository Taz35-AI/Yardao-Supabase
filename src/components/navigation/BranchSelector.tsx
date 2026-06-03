// src/components/navigation/BranchSelector.tsx - Fixed dropdown width with all original functionality preserved
// Fixed version - text colors matching logo (#b3f243)

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useBranches } from '@/hooks/useBranches'
import { ChevronDown, MapPin, Plus, Check } from 'lucide-react'

export function BranchSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { branches, loading } = useBranches()
  const [isOpen, setIsOpen] = useState(false)

  // Don't show on non-dashboard pages
  if (!pathname.includes('/dashboard')) {
    return null
  }

  // Get current branch from URL query params
  // This will properly read ?branch=fairview-barking or any other branch
  const branchParam = searchParams.get('branch')
  const currentBranch = branchParam || 'main'

  const handleBranchChange = (branchSlug: string) => {
    setIsOpen(false)
    
    // Navigate to the new branch
    if (branchSlug === 'main') {
      router.push('/dashboard')
    } else {
      router.push(`/dashboard?branch=${branchSlug}`)
    }
  }

  const getCurrentBranchName = () => {
    // Find the branch by slug
    const branch = branches.find(b => b.slug === currentBranch)
    
    if (branch) {
      return branch.name
    }
    
    // If branch not found in list, but we have a branch param, show it
    // This handles the case where branches might not be loaded yet
    if (currentBranch === 'main') {
      // Find the main branch from the branches array
      const mainBranch = branches.find(b => b.isMain)
      return mainBranch?.name || 'Main Branch'
    }
    
    // Format the slug into a readable name as fallback
    // e.g., "fairview-barking" becomes "Fairview Barking"
    return currentBranch
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
        <MapPin className="w-4 h-4" />
        <span>Loading branches...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-[#025940] rounded-lg transition-colors"
        aria-label={`Current branch: ${getCurrentBranchName()}`}
      >
        <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span style={{ color: '#b3f243' }}>{getCurrentBranchName()}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: '#b3f243' }} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* ✅ Dropdown - Width matches the parent container exactly */}
          <div className="branch-dropdown absolute top-full left-0 right-0 mt-2 bg-[#012619] rounded-lg shadow-lg border-2 border-[#025940] z-50 max-w-full">
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {/* Header - Logo color */}
              <div className="text-xs font-semibold px-3 py-2 uppercase tracking-wider truncate" style={{ color: '#b3f243' }}>
                Select Branch
              </div>
              
              {/* Main Branch - Show actual name from database */}
              {(() => {
                const mainBranch = branches.find(b => b.isMain)
                return mainBranch ? (
                  <button
                    onClick={() => handleBranchChange('main')}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#025940] rounded-md transition-colors min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#b3f243' }} />
                      <span className="font-bold truncate" style={{ color: '#b3f243' }}>{mainBranch.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0 whitespace-nowrap" style={{ 
                        backgroundColor: 'rgba(179, 242, 67, 0.15)',
                        color: '#b3f243',
                        borderColor: 'rgba(179, 242, 67, 0.3)'
                      }}>
                        Main
                      </span>
                    </div>
                    {currentBranch === 'main' && (
                      <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#b3f243' }} />
                    )}
                  </button>
                ) : null
              })()}
              
              {/* Other branches - Logo color text */}
              {branches
                .filter(branch => !branch.isMain)
                .map(branch => (
                  <button
                    key={branch.id}
                    onClick={() => handleBranchChange(branch.slug)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#025940] rounded-md transition-colors min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#b3f243' }} />
                      <span className="font-bold truncate" style={{ color: '#b3f243' }}>{branch.name}</span>
                    </div>
                    {currentBranch === branch.slug && (
                      <Check className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#b3f243' }} />
                    )}
                  </button>
                ))}
              
              {/* Manage Branches Link - Logo color */}
              <div className="border-t-2 border-[#025940] mt-2 pt-2">
                <button
                  onClick={() => {
                    router.push('/settings?tab=branches')
                    setIsOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#025940] rounded-md transition-colors"
                  style={{ color: '#b3f243' }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Manage Branches</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}