"use server";

import { revalidatePath } from "next/cache";
import {
  approveReviewItem as approveReviewItemMutation,
  rejectReviewItem as rejectReviewItemMutation,
} from "@/lib/review-queue";
import type { ReviewActionResult } from "@/lib/review-types";

export async function approveReviewItem(id: string): Promise<ReviewActionResult> {
  const result = await approveReviewItemMutation(id);

  if (!result.error) {
    revalidatePath("/review");
  }

  return result;
}

export async function rejectReviewItem(
  id: string,
  note?: string
): Promise<ReviewActionResult> {
  const result = await rejectReviewItemMutation(id, note);

  if (!result.error) {
    revalidatePath("/review");
  }

  return result;
}
