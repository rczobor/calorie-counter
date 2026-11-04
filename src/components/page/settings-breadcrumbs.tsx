import { Link } from '@tanstack/react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export function SettingsBreadcrumbs({
  current,
  onCurrentClick,
}: {
  current: string
  onCurrentClick?: () => void
}) {
  return (
    <Breadcrumb className="mb-5">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            className="inline-flex min-h-8 items-center"
            render={<Link to="/settings" />}
          >
            Settings
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {onCurrentClick ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center hover:text-foreground"
              onClick={onCurrentClick}
            >
              {current}
            </button>
          ) : (
            <BreadcrumbPage>{current}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
