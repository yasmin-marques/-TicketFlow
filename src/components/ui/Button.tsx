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
  primary: 'border-transparent bg-accent text-bg hover:bg-accent-600 active:bg-accent-700',
  secondary: 'border-divider hover:bg-text/7 active:bg-text/14',
  ghost: 'border-transparent text-accent px-1 hover:bg-accent/10 active:bg-accent/18',
}

const sizes: Record<Size, string> = {
  md: 'px-[14.4px] py-2 text-sm',
  lg: 'px-[22px] py-3 text-[15px]',
  xl: 'px-[18px] py-3.5 text-base',
  icon: 'size-9 p-0 text-sm',
  'icon-lg': 'size-[46px] p-0 text-base',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: BaseProps & { className?: string }): string {
  return cn(
    'inline-flex items-center justify-center gap-1.5 border font-extrabold leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-45',
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
