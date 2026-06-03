// src/components/ui/Badge.tsx - Enhanced Badge UI Component with Mobile Responsive Text

'use client'

import { cn } from '@/lib/utils'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  responsive?: boolean // New prop for responsive behavior
}

export function Badge({ 
  className, 
  variant = 'default',
  size = 'md',
  responsive = true,
  ...props 
}: BadgeProps) {
  return (
    <div
      className={cn(
        // Base styles
        "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
        
        // Size variants
        {
          "px-1.5 py-0.5 text-xs": size === 'sm',
          "px-2.5 py-0.5 text-xs": size === 'md',
          "px-3 py-1 text-sm": size === 'lg',
        },
        
        // Color variants
        {
          "border-transparent bg-blue-600 text-white hover:bg-blue-700": variant === 'default',
          "border-transparent bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600": variant === 'secondary',
          "border-transparent bg-red-600 text-white hover:bg-red-700": variant === 'destructive',
          "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700": variant === 'outline',
        },
        
        // Responsive text handling
        responsive && [
          "max-w-full", // Prevent overflow
          "overflow-hidden", // Hide overflow
          "flex-shrink-0", // Prevent shrinking in flex containers
        ],
        
        className
      )}
      {...props}
    />
  )
}

// Specialized mobile-friendly badge for service banners
export function ServiceBadge({ 
  children,
  icon,
  className,
  ...props 
}: BadgeProps & { 
  icon?: React.ReactNode 
}) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className={cn(
        "text-xs flex-shrink-0 whitespace-nowrap max-w-full",
        "flex items-center gap-1",
        className
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </Badge>
  )
}