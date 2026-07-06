"use client";

import { useEffect, useState } from "react";
import { ReviewCard } from "@/components/review/ReviewCard";
import type { ReviewQueueItem } from "@/lib/review-types";

export function ReviewQueueClient({
  initialItems,
}: {
  initialItems: ReviewQueueItem[];
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  function handleItemResolved(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-lg">
        <p className="font-heading text-xl font-bold text-heading">
          Queue caught up!
        </p>
        <p className="mt-2 text-gray-600">No pending reviews.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm font-medium text-gray-500">
        {items.length} item{items.length === 1 ? "" : "s"} pending
      </p>
      {items.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          onResolved={() => handleItemResolved(item.id)}
        />
      ))}
    </div>
  );
}
