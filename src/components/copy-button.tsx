import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/messages'
import { messages } from './copy-button.messages'

/** Copies text people paste elsewhere; the label confirms for a moment. */
export function CopyButton({ text }: { text: string }) {
  const t = useMessages(messages)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t.copyFailed)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? t.copiedLabel : t.copy}
      </Button>
      {/* Outside the button, so it isn't part of its name; the label
          change isn't announced on its own. */}
      <span role="status" className="sr-only">
        {copied ? t.copied : ''}
      </span>
    </>
  )
}
