import { Skeleton, SkeletonRow, SkeletonSectionHeader } from '@/components/ui/Skeleton'

// The event page leads with one loud block (rule 1), so the skeleton leads
// with a block of that weight rather than a row of the same grey as the rest.
export default function Loading() {
  return (
    <>
      <div aria-hidden="true" className="mb-3.5 flex h-14 items-center gap-3 border-b border-line-card px-4">
        <Skeleton w={20} h={20} radius="var(--r-pill)" />
        <Skeleton w={140} h={15} />
      </div>
      <main className="mx-auto w-full max-w-col px-4 pb-6">
        <Skeleton h={96} radius="var(--r-lg)" />
        <div className="mt-[26px]">
          <SkeletonSectionHeader w={88} />
          <div className="rounded-md border border-line-card bg-paper px-3.5 py-3">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} w={30} h={30} radius="var(--r-pill)" />
              ))}
            </div>
            <Skeleton w={208} h={13} style={{ marginTop: 12 }} />
          </div>
        </div>
        {[104, 96].map((w) => (
          <div key={w} className="mt-[26px]">
            <SkeletonSectionHeader w={w} />
            <div className="flex flex-col gap-2">
              {[0, 1].map((i) => (
                <SkeletonRow key={i} tile={0} lines={[152, 96]} trailing={56} />
              ))}
            </div>
          </div>
        ))}
      </main>
    </>
  )
}
