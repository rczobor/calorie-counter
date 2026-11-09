import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useMessages } from '@/i18n/messages'
import { messages } from './sonner.messages'

const Toaster = ({ ...props }: ToasterProps) => {
  const t = useMessages(messages)
  const { theme = 'system' } = useTheme()

  return (
    // Toasts are a raised neutral cell in the app's type, centred under the
    // content column: no status tints, which would compete with left, over
    // and estimate. The icon carries success, warning and error.
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-center"
      className="toaster group"
      containerAriaLabel={t.notifications}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-caution" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          fontFamily: 'inherit',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
          title: '!text-[0.9375rem] !font-normal',
          // An action such as Undo is the outlined capsule in the toast's own
          // colour, not sonner's filled block, which reads as a primary.
          actionButton:
            '!h-9 !rounded-full !border !border-input !bg-transparent !px-3.5 !text-[0.9375rem] !font-medium !text-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
