import { Page } from '@/components/ui/Page'
import { Skeleton, SkeletonHeader, SkeletonRow } from '@/components/ui/Skeleton'

// The browser carries a filter strip above the list, and it is the tallest
// thing on the page: leaving it out would let everything below jump upward.
export default function Loading() {
  return (
    <Page>
      <SkeletonHeader />
      <div aria-hidden="true" className="mb-[18px] flex gap-2">
        {[72, 96, 64].map((w) => (
          <Skeleton key={w} w={w} h={32} radius="var(--r-pill)" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} tile={0} lines={[i % 2 ? 196 : 156, 120]} trailing={64} />
        ))}
      </div>
    </Page>
  )
}
