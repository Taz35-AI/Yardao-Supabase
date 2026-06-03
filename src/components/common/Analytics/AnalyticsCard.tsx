// src/components/common/Analytics/AnalyticsCard.tsx
'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { LucideIcon } from 'lucide-react'

interface AnalyticsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  gradientFrom: string
  gradientTo: string
  textColor?: string
  onClick?: () => void
  className?: string
}

export const AnalyticsCard = React.memo(function AnalyticsCard({
  title,
  value,
  icon: Icon,
  gradientFrom,
  gradientTo,
  textColor = 'text-white',
  onClick,
  className = ''
}: AnalyticsCardProps) {
  return (
    <Card 
      className={`bg-gradient-to-r ${gradientFrom} ${gradientTo} ${textColor} border-0 ${onClick ? 'cursor-pointer hover:scale-105' : ''} transition-all duration-200 ${className}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
          <Icon className="h-8 w-8 opacity-80" />
        </div>
      </CardContent>
    </Card>
  )
})