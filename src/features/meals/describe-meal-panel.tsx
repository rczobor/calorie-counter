import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAction } from '@/features/households/convex-hooks'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import type { DraftMealItem } from './meal-draft'
import { messages } from './describe-meal-panel.messages'

const MAX_TEXT_LENGTH = 1_000
// Claude's recommended longest edge; larger photos cost more and read no better.
const MAX_PHOTO_EDGE = 1_568

type Photo = { bytes: ArrayBuffer; url: string }
type Problem =
  'photoUnreadable' | 'empty' | 'limited' | 'unavailable' | 'failed'

/** A JPEG no larger than Claude needs, so uploads stay small on mobile data. */
async function preparePhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(
    1,
    MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!blob) throw new Error('The photo could not be encoded.')
  return { bytes: await blob.arrayBuffer(), url: URL.createObjectURL(blob) }
}

export function DescribeMealPanel({
  closeButton,
  onItems,
}: {
  closeButton: ReactNode
  onItems: (items: DraftMealItem[], mealName: string | undefined) => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const draft = useAction(api.aiMealDraft.draft)
  const fileInput = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  // Cancel unmounts the panel while a request may still be running; its
  // answer must not add foods or reset whatever the person opened next.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.url)
  }, [photo])

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    try {
      setPhoto(await preparePhoto(file))
    } catch {
      setProblem('photoUnreadable')
    }
  }

  const canSubmit =
    !pending &&
    (text.trim().length > 0 || photo !== null) &&
    text.length <= MAX_TEXT_LENGTH

  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    setProblem(null)
    try {
      const result = await draft({
        locale,
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(photo
          ? { image: { data: photo.bytes, mediaType: 'image/jpeg' as const } }
          : {}),
      })
      if (!mounted.current) return
      if (result.status !== 'ok') {
        setProblem(result.status)
        return
      }
      toast.success(t.added(result.items.length))
      onItems(result.items, result.mealName)
    } catch {
      setProblem('failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="inset-group p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <p className="type-headline">{t.title}</p>
          <p className="mt-0.5 type-footnote text-muted-foreground">{t.hint}</p>
        </div>
        {closeButton}
      </div>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="describeMeal">{t.description}</Label>
          <Textarea
            id="describeMeal"
            autoFocus
            maxLength={MAX_TEXT_LENGTH}
            placeholder={t.descriptionPlaceholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </div>
        {photo ? (
          <div className="flex items-center gap-3">
            <img
              src={photo.url}
              alt={t.photoPreview}
              className="size-16 shrink-0 rounded-lg object-cover"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <Camera />
              {t.changePhoto}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t.removePhoto}
              onClick={() => setPhoto(null)}
            >
              <X />
            </Button>
          </div>
        ) : null}
        {/* Without `capture`, phones offer both the camera and the library. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void choosePhoto(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          {photo ? null : (
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
            >
              <Camera />
              {t.addPhoto}
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={!canSubmit}
            aria-busy={pending}
            onClick={() => void submit()}
          >
            <Sparkles />
            {pending ? t.suggesting : t.suggest}
          </Button>
        </div>
        {problem ? (
          <p role="status" className="type-footnote text-destructive">
            {t[problem]}
          </p>
        ) : null}
        <p className="type-footnote text-muted-foreground">{t.privacy}</p>
      </div>
    </div>
  )
}
