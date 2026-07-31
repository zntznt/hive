import { Page } from '@/components/ui/Page'
import { Skeleton, SkeletonHeader, SkeletonSectionHeader } from '@/components/ui/Skeleton'

// Account is groups of stacked rows rather than cards, so it gets bars at the
// row heights instead of SkeletonRow.
export default function Loading() {
  return (
    <Page>
      <SkeletonHeader titleWidth={116} lede={false} />
      <section aria-hidden="true">
        <SkeletonSectionHeader w={72} />
        <div className="flex items-center gap-3">
          <Skeleton w={56} h={62} radius="var(--r-md)" />
          <Skeleton w={140} h={32} radius="var(--r-pill)" />
        </div>
      </section>
      {[124, 168, 96].map((w, group) => (
        <section key={w} className="mt-[26px]" aria-hidden="true">
          <SkeletonSectionHeader w={w} />
          <div className="flex flex-col gap-2">
            {Array.from({ length: group === 1 ? 3 : 2 }, (_, i) => (
              <Skeleton key={i} h={46} radius="var(--r-md)" />
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}
