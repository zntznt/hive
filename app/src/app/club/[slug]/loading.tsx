import { Skeleton, SkeletonRow, SkeletonSectionHeader } from '@/components/ui/Skeleton'

// A pushed screen: the AppBar is part of the page rather than the layout, so
// the skeleton has to stand in for it too or the content lands 56px high and
// slides down.
export default function Loading() {
  return (
    <>
      <div aria-hidden="true" className="mb-3.5 flex h-14 items-center gap-3 border-b border-line-card px-4">
        <Skeleton w={20} h={20} radius="var(--r-pill)" />
        <Skeleton w={124} h={15} />
      </div>
      <main className="mx-auto w-full max-w-col px-4 pb-6">
        {/* the banner, which is the tallest thing above the fold */}
        <Skeleton h={112} radius="var(--r-lg)" />
        <div className="mt-3 flex items-center gap-3">
          <Skeleton w={48} h={52} radius="var(--r-md)" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton w={148} h={16} />
            <Skeleton w={196} h={12} />
          </span>
        </div>
        <div className="mt-[26px]">
          <SkeletonSectionHeader w={96} />
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} tile={0} lines={[i % 2 ? 176 : 144, 112]} trailing={60} />
            ))}
          </div>
        </div>
        <div className="mt-[26px]">
          <SkeletonSectionHeader w={112} />
          <div className="overflow-hidden rounded-lg border border-line-card bg-paper">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2.5 border-t border-line-divider px-[13px] py-[11px] first:border-t-0">
                <Skeleton w={28} h={28} radius="var(--r-pill)" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <Skeleton w={104} h={13} />
                  <Skeleton w={132} h={11} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
