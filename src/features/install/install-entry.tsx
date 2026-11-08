import { Dialog } from '@base-ui/react/dialog'
import { ChevronRight, Download, Share, SquarePlus, X } from 'lucide-react'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useInstall } from './install-provider'
import { useMessages } from '@/i18n/messages'
import { messages } from './install-entry.messages'

function strong(label: string) {
  return <strong>{label}</strong>
}

export function InstallEntry({
  variant,
  eligible = true,
}: {
  variant: 'suggestion' | 'settings'
  eligible?: boolean
}) {
  const t = useMessages(messages)
  const install = useInstall()
  const trigger = useRef<HTMLButtonElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!install) return null

  const visible =
    variant === 'settings' ? install.available : eligible && install.suggest

  async function activate() {
    if (!install) return
    setFailed(false)
    if (!install.canPrompt) {
      setHelpOpen(true)
      return
    }
    try {
      await install.promptInstall()
    } catch {
      setFailed(true)
      setHelpOpen(true)
    }
  }

  return (
    <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
      {visible ? (
        variant === 'settings' ? (
          <button
            ref={trigger}
            type="button"
            className={LIST_ROW_CLASS}
            onClick={() => void activate()}
            disabled={install.pending}
          >
            <span className="min-w-0 flex-1">{t.addToDevice}</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ) : (
          <section
            aria-label={t.suggestionLabel}
            className="mt-6 inset-group p-4"
          >
            <div className="flex items-start gap-3">
              <Download
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <h2 className="type-headline">{t.suggestionTitle}</h2>
                <p className="mt-1 type-subhead text-muted-foreground">
                  {t.suggestionDescription}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    ref={trigger}
                    size="sm"
                    onClick={() => void activate()}
                    disabled={install.pending}
                  >
                    {install.pending
                      ? t.opening
                      : install.canPrompt
                        ? t.install
                        : t.showHow}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={install.dismiss}
                    disabled={install.pending}
                  >
                    {t.dismiss}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )
      ) : null}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 dark:bg-black/75" />
        <Dialog.Popup
          finalFocus={trigger}
          className="elevated fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-background p-5 shadow-[0_20px_60px_-12px_oklch(0_0_0/0.35)] outline-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="type-title">
                {t.addToDevice}
              </Dialog.Title>
              <Dialog.Description className="mt-1 type-subhead text-muted-foreground">
                {t.helpDescription}
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mt-2 -mr-2 text-muted-foreground"
                  aria-label={t.closeHelp}
                />
              }
            >
              <X />
            </Dialog.Close>
          </div>
          {failed ? (
            <p role="alert" className="mt-4 text-sm">
              {t.promptFailed}
            </p>
          ) : null}
          {install.platform === 'ios' ? (
            <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>{t.iosOpenSafari(strong)}</li>
              <li>
                {t.iosShare(
                  strong,
                  <Share
                    className="mx-1 inline size-4 align-text-bottom"
                    aria-hidden="true"
                  />,
                )}
              </li>
              <li>
                {t.iosAddToHomeScreen(
                  strong,
                  <SquarePlus
                    className="mx-1 inline size-4 align-text-bottom"
                    aria-hidden="true"
                  />,
                )}
              </li>
              <li>{t.iosWebApp(strong)}</li>
            </ol>
          ) : install.platform === 'safari' ? (
            <p className="mt-5 text-sm leading-relaxed">
              {t.safariDock(strong)}
            </p>
          ) : (
            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p>
                {install.platform === 'android'
                  ? t.androidMenu(strong)
                  : t.browserMenu(strong)}
              </p>
              {install.platform !== 'android' ? <p>{t.addressBar}</p> : null}
              <p className="text-muted-foreground">{t.fallback}</p>
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <Dialog.Close render={<Button variant="outline" />}>
              {t.done}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
