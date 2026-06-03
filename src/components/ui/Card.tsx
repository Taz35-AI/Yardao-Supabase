// src/components/ui/Card.tsx - Enhanced Professional Card Component
import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  'rounded-xl border transition-all duration-200',
  {
    variants: {
      variant: {
        default: 
          'bg-white/95 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md dark:bg-gray-900/95 dark:border-gray-800/60 card-elevated',
        
        elevated: 
          'bg-white/98 backdrop-blur border-gray-200/50 shadow-md hover:shadow-lg dark:bg-gray-900/98 dark:border-gray-800/50',
        
        glass: 
          'bg-white/10 backdrop-blur-xl border-white/20 shadow-xl dark:bg-gray-900/10 dark:border-gray-700/20',
        
        outline: 
          'bg-transparent border-2 border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
        
        gradient: 
          'bg-gradient-to-br from-white/90 to-gray-50/90 backdrop-blur border-gray-200/50 shadow-lg dark:from-gray-900/90 dark:to-gray-800/90 dark:border-gray-700/50',
      },
      size: {
        sm: 'p-3',
        default: 'p-4',
        lg: 'p-6',
        xl: 'p-8',
      },
      interactive: {
        true: 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      interactive: false,
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, size, interactive, className }))}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'centered' | 'bordered'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col space-y-1.5',
      {
        'p-6 pb-4': variant === 'default',
        'p-6 pb-4 text-center': variant === 'centered',
        'p-6 pb-4 border-b border-gray-200/60 dark:border-gray-700/60': variant === 'bordered',
      },
      className
    )}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement> & {
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    gradient?: boolean
  }
>(({ className, as: Component = 'h3', gradient = false, ...props }, ref) => (
  <Component
    ref={ref}
    className={cn(
      'font-semibold leading-none tracking-tight',
      gradient && 'bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent dark:from-gray-100 dark:to-gray-300',
      !gradient && 'text-gray-900 dark:text-gray-100',
      className
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      'text-sm text-gray-600 dark:text-gray-400 leading-relaxed',
      className
    )}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'padded' | 'flush'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      {
        'p-6 pt-0': variant === 'default',
        'p-6': variant === 'padded',
        'p-0': variant === 'flush',
      },
      className
    )}
    {...props}
  />
))
CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'bordered' | 'actions'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center p-6 pt-0',
      {
        '': variant === 'default',
        'border-t border-gray-200/60 dark:border-gray-700/60 pt-4': variant === 'bordered',
        'justify-end space-x-2': variant === 'actions',
      },
      className
    )}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }