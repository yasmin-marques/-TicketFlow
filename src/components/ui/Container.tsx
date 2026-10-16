import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
}

/** Container de 1280px com margem 40 (mobile: 16), conforme a grade do protótipo. */
export function Container({ as: Tag = 'div', className, ...rest }: ContainerProps) {
  return <Tag className={cn('mx-auto w-full max-w-[1280px] px-4 lg:px-10', className)} {...rest} />
}
