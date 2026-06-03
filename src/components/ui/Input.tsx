import React from 'react'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'size'> {
  label?: string
  error?: string
  helperText?: string
  multiline?: boolean
  rows?: number
}

export const Input = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  ({ label, error, helperText, multiline = false, rows = 3, className = '', ...props }, ref) => {
    const baseClasses = `
      w-full px-3 py-2 border rounded-md transition-colors
      focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
      disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
      dark:disabled:bg-gray-800 dark:disabled:text-gray-400
    `

    const stateClasses = error
      ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300 focus:ring-red-500 dark:border-red-600 dark:bg-red-900/10 dark:text-red-100'
      : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400'

    const combinedClasses = `${baseClasses} ${stateClasses} ${className}`

    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        {multiline ? (
          <textarea
            ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
            rows={rows}
            className={combinedClasses}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.ForwardedRef<HTMLInputElement>}
            className={combinedClasses}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        
        {helperText && !error && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'