import { Page } from '@/components/ui/Page'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

// Search leads with its field rather than a title, so the skeleton does too.
export default function Loading() {
  return (
    <Page>
      <Skeleton w="100%" h={44} radius="var(--r-pill)" />
      <div className="mt-[18px] flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={i} lines={[i % 2 ? 172 : 140, 96]} trailing={0} />
        ))}
      </div>
    </Page>
  )
}
