import { Dialog } from '@base-ui/react/dialog'
import { ChevronRight, Download, Share, SquarePlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useInstall } from './install-provider'

export function InstallEntry({
  variant,
  eligible = true,
}: {
  variant: 'suggestion' | 'settings'
  eligible?: boolean
}) {
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
            className="flex min-h-14 w-full items-center justify-between gap-4 py-5 text-left text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => void activate()}
            disabled={install.pending}
          >
            <span className="font-medium">Add to your device</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        ) : (
          <section
            aria-label="Add Calorie Counter to your device"
            className="mt-6 rounded-lg border border-border/60 p-4"
          >
            <div className="flex items-start gap-3">
              <Download
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium">
                  Keep Calorie Counter handy
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add it to your home screen for quicker meal logging.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    ref={trigger}
                    variant="outline"
                    onClick={() => void activate()}
                    disabled={install.pending}
                  >
                    {install.pending
                      ? 'Opening installation…'
                      : install.canPrompt
                        ? 'Install app'
                        : 'Show me how'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={install.dismiss}
                    disabled={install.pending}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )
      ) : null}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Popup
          finalFocus={trigger}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">
                Add to your device
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Open Calorie Counter like an app next time.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close installation steps"
                />
              }
            >
              <X />
            </Dialog.Close>
          </div>
          {failed ? (
            <p role="alert" className="mt-4 text-sm">
              The install dialog couldn’t open. Try these browser steps instead.
            </p>
          ) : null}
          {install.platform === 'ios' ? (
            <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>
                Open this page in <strong>Safari</strong>.
              </li>
              <li>
                Tap{' '}
                <Share
                  className="mx-1 inline size-4 align-text-bottom"
                  aria-hidden="true"
                />
                <strong>Share</strong> in the browser menu or toolbar.
              </li>
              <li>
                Scroll down and tap{' '}
                <SquarePlus
                  className="mx-1 inline size-4 align-text-bottom"
                  aria-hidden="true"
                />
                <strong>Add to Home Screen</strong>.
              </li>
              <li>
                If shown, turn on <strong>Open as Web App</strong>, then tap{' '}
                <strong>Add</strong>.
              </li>
            </ol>
          ) : install.platform === 'safari' ? (
            <p className="mt-5 text-sm leading-relaxed">
              In Safari, choose <strong>File → Add to Dock</strong>, then click{' '}
              <strong>Add</strong>. If that option is missing, try Chrome or
              Edge.
            </p>
          ) : (
            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p>
                Open your browser’s menu and look for{' '}
                <strong>Install app</strong>
                {install.platform === 'android' ? (
                  <>
                    {' '}
                    or <strong>Add to Home Screen</strong>
                  </>
                ) : (
                  <> or an option to install this page as an app</>
                )}
                .
              </p>
              {install.platform !== 'android' ? (
                <p>You may also see an install icon in the address bar.</p>
              ) : null}
              <p className="text-muted-foreground">
                If no installation option appears, try opening this page in
                Chrome or Edge. You can keep using Calorie Counter in your
                browser.
              </p>
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <Dialog.Close render={<Button variant="outline" />}>
              Done
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
