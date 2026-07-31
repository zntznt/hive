import { Page } from '@/components/ui/Page'
import { SkeletonHeader, SkeletonRow, SkeletonSectionHeader } from '@/components/ui/Skeleton'

// The plate is groups of rows under 11px labels, and it is the screen people
// open most, so it is the one where a jump on arrival is most noticeable.
export default function Loading() {
  return (
    <Page>
      <SkeletonHeader titleWidth={148} />
      {[0, 1].map((group) => (
        <section key={group} className={group === 0 ? '' : 'mt-[26px]'}>
          <SkeletonSectionHeader w={group === 0 ? 132 : 88} />
          <div className="flex flex-col gap-2">
            {Array.from({ length: group === 0 ? 3 : 2 }, (_, i) => (
              <SkeletonRow key={i} lines={[i % 2 ? 184 : 148, 104]} />
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}
