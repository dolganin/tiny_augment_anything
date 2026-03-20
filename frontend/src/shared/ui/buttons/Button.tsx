import clsx from 'clsx'
import { ButtonHTMLAttributes } from 'react'
import '@/shared/ui/buttons/button.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  fullWidth?: boolean
}

export function Button({
  className,
  variant = 'primary',
  fullWidth = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx('button', `button--${variant}`, fullWidth && 'button--full', className)}
      {...props}
    />
  )
}
