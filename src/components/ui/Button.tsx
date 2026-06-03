import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm',
        secondary: 'bg-secondary-500 text-white hover:bg-secondary-600 shadow-sm',
        outline: 'border border-primary-500 text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950',
        ghost: 'hover:bg-primary-50 dark:hover:bg-primary-950 text-primary-600 dark:text-primary-400',
        destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  hapticStyle?: ImpactStyle
  disableHaptics?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, hapticStyle = ImpactStyle.Light, disableHaptics = false, onClick, disabled, ...props }, ref) => {
    
    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      // Trigger haptic feedback before onClick
      if (!disableHaptics && !disabled) {
        try {
          await Haptics.impact({ style: hapticStyle })
        } catch (error) {
          // Haptic feedback not available (web browser, etc.)
        }
      }
      
      // Call the original onClick handler
      if (onClick) {
        onClick(e)
      }
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }