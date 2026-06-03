// src/components/common/Tables/StylishTableHeader.tsx - NEW COMPONENT
'use client'

import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface StylishTableHeaderProps {
  children: React.ReactNode
  sortable?: boolean
  sortDirection?: 'asc' | 'desc' | null
  onSort?: () => void
  className?: string
  width?: string
}

export function StylishTableHeader({ 
  children, 
  sortable = false, 
  sortDirection = null, 
  onSort, 
  className = '',
  width
}: StylishTableHeaderProps) {
  const getSortIcon = () => {
    if (!sortable) return null
    
    if (sortDirection === 'asc') {
      return <ArrowUp className="w-3 h-3 text-white/80" />
    } else if (sortDirection === 'desc') {
      return <ArrowDown className="w-3 h-3 text-white/80" />
    } else {
      return <ArrowUpDown className="w-3 h-3 text-white/60" />
    }
  }

  const baseClasses = `
    py-4 px-6 text-left text-xs font-semibold text-white uppercase tracking-wider
    bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-600
    border-r border-teal-400/30 last:border-r-0
    relative overflow-hidden
    transition-all duration-200
  `

  const sortableClasses = sortable ? `
    hover:from-teal-400 hover:via-teal-500 hover:to-cyan-500 
    cursor-pointer select-none
    hover:shadow-lg hover:shadow-teal-500/20
    active:scale-[0.98]
  ` : ''

  const combinedClasses = `${baseClasses} ${sortableClasses} ${className}`

  return (
    <th 
      className={combinedClasses}
      onClick={sortable ? onSort : undefined}
      style={{ width }}
    >
      {/* Gradient overlay for extra depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/10 pointer-events-none" />
      
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
           style={{
             backgroundImage: `repeating-linear-gradient(
               45deg,
               transparent,
               transparent 2px,
               rgba(255,255,255,0.1) 2px,
               rgba(255,255,255,0.1) 4px
             )`
           }} />
      
      {/* Content */}
      <div className="relative z-10 flex items-center justify-between">
        <span className="drop-shadow-sm">{children}</span>
        {getSortIcon()}
      </div>
      
      {/* Hover glow effect */}
      {sortable && (
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-300/20 to-cyan-300/20" />
        </div>
      )}
    </th>
  )
}

// Quick wrapper for your existing table headers
export function TurquoiseTableHead({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <thead className={`relative ${className}`}>
      {/* Optional: Add a subtle shadow under the header */}
      <tr className="relative">
        <td colSpan={100} className="absolute inset-x-0 top-full h-1 bg-gradient-to-b from-teal-600/20 to-transparent pointer-events-none" />
      </tr>
      {children}
    </thead>
  )
}