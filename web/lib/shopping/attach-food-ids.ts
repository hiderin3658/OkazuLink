// items に food_id を付与する純粋関数。
//
// Server Action ファイル（actions.ts は "use server"）からは同期関数を
// export できないため、本関数を独立ファイルに切り出して vitest からも
// import できるようにする。

import { matchFood } from "@/lib/foods/matcher";
import type { ShoppingItemParsed } from "./schema";

export function attachFoodIdsToItems(
  items: ShoppingItemParsed[],
  shoppingRecordId: string,
  index: Map<string, string>,
): (ShoppingItemParsed & { shopping_record_id: string; food_id: string | null })[] {
  return items.map((it) => ({
    ...it,
    shopping_record_id: shoppingRecordId,
    food_id: matchFood(it.raw_name, it.display_name, index),
  }));
}
