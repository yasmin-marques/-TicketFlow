import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg' | 'xl' | 'icon' | 'icon-lg'

interface BaseProps {
  variant?: Variant
  size?: Size
  /** Ocupa a largura toda. */
  block?: boolean
  children?: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'border-transparent bg-accent text-bg shadow-sm shadow-accent/20 hover:bg-accent-600 hover:shadow-md hover:shadow-accent/25 active:bg-accent-700',
  secondary: 'border-divider bg-card hover:border-text/35 hover:bg-neutral-100 active:bg-neutral-200',
  ghost: 'border-transparent text-accent-700 px-2 hover:bg-accent/8 active:bg-accent/14',
}

const sizes: Record<Size, string> = {
  md: 'min-h-9 px-4 py-2 text-sm',
  lg: 'min-h-11 px-[22px] py-3 text-[15px]',
  xl: 'min-h-12 px-6 py-3.5 text-base',
  icon: 'size-9 p-0 text-sm',
  'icon-lg': 'size-11 p-0 text-base',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: BaseProps & { className?: string }): string {
  return cn(
    'transition-control inline-flex items-center justify-center gap-1.5 rounded-control border font-bold leading-tight no-underline active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  )
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined }
type ButtonLinkProps = BaseProps & Omit<LinkProps, 'className'> & { to: LinkProps['to']; className?: string }

/** Botão do design system. Com `to` renderiza um `<Link>` com a mesma aparência. */
export function Button(props: ButtonProps | ButtonLinkProps) {
  if (props.to !== undefined) {
    const { variant, size, block, className, children, ...rest } = props
    return (
      <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
        {children}
      </Link>
    )
  }
  const { variant, size, block, className, children, type = 'button', ...rest } = props
  return (
    <button type={type} className={buttonClasses({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  )
}
