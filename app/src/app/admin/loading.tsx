import { Page } from '@/components/ui/Page'
import { SkeletonHeader, SkeletonRow, SkeletonSectionHeader } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <Page>
      <SkeletonHeader titleWidth={172} />
      {[112, 144, 168].map((w, group) => (
        <section key={w} className={group === 0 ? '' : 'mt-[26px]'}>
          <SkeletonSectionHeader w={w} />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }, (_, i) => (
              <SkeletonRow key={i} tile={28} lines={[160, 108]} trailing={group === 0 ? 64 : 0} />
            ))}
          </div>
        </section>
      ))}
    </Page>
  )
}
