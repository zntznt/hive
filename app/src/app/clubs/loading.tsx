import { Page } from '@/components/ui/Page'
import { SkeletonHeader, SkeletonRow } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <Page>
      <SkeletonHeader titleWidth={92} />
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <SkeletonRow key={i} tile={34} lines={[132, 152]} trailing={0} />
        ))}
      </div>
    </Page>
  )
}
