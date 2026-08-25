import { Skeleton, SkeletonRow, SkeletonSectionHeader } from '@/components/ui/Skeleton'

// A pushed screen: the AppBar is part of the page rather than the layout, so
// the skeleton has to stand in for it too or the content lands 56px high and
// slides down.
//
// The head is the header card's shape, not the masthead it replaced. This drew
// a 112px banner and a 48x52 tile with two left-aligned lines beside it, which
// is what the club page looked like before the front door became one centred
// card. What arrived was a hexagon over a centred name, a meta line, faces, a
// description and a links band, so the whole head jumped and reflowed the
// moment the data landed, which is the one thing a skeleton exists to prevent.
export default function Loading() {
  return (
    <>
      <div aria-hidden="true" className="mb-3.5 flex h-14 items-center gap-3 border-b border-line-card px-4">
        <Skeleton w={20} h={20} radius="var(--r-pill)" />
        <Skeleton w={124} h={15} />
      </div>
      <main className="mx-auto w-full max-w-col px-4 pb-6">
        <div className="mb-[26px] mt-1 flex flex-col items-center gap-2.5 rounded-lg border border-line-card px-4 pb-[14px] pt-[18px] shadow-card">
          {/* the paper hexagon, at the size club-header.tsx gives it */}
          <Skeleton w={74} h={80} radius="var(--r-md)" />
          <Skeleton w={168} h={22} />
          <Skeleton w={208} h={13} />
          <Skeleton w={96} h={20} radius="var(--r-pill)" />
          <span className="flex w-full flex-col items-center gap-1.5">
            <Skeleton w={264} h={13} />
            <Skeleton w={232} h={13} />
          </span>
          <Skeleton w={140} h={30} radius="var(--r-pill)" />
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
