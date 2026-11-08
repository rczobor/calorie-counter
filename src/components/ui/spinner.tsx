import { Loader2Icon } from 'lucide-react'

import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './spinner.messages'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useMessages(messages)
  return (
    <Loader2Icon
      role="status"
      aria-label={t.loading}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
