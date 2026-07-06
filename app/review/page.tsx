import { SectionLabel } from "@/components/SectionLabel";
import { fetchReviewQueue } from "@/lib/review-queue";
import { ReviewQueueClient } from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { items, error } = await fetchReviewQueue();

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Error</SectionLabel>
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <p className="font-heading text-lg font-bold text-red-600">
              Error: {error}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
        <header className="mb-16">
          <SectionLabel>Internal</SectionLabel>
          <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
            Review Queue
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Approve or reject pending program version updates before they go
            live.
          </p>
        </header>

        <ReviewQueueClient initialItems={items} />
      </main>
    </div>
  );
}
