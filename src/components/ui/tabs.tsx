import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'

import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

/** Section tabs are the shared segmented control; `className` styles its track. */
function TabsList({
  className,
  ...props
}: Omit<TabsPrimitive.List.Props, 'className'> & { className?: string }) {
  return (
    <SegmentedTrack className={className}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={SEGMENT_LIST_CLASS}
        {...props}
      />
    </SegmentedTrack>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(SEGMENT_CLASS, className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
