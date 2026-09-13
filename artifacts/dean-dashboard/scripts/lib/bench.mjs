/**
 * Addressing a feeder-bench record.
 *
 * The bench does not have ids. 6,553 of its 11,930 rows carry no `id` field at
 * all, and the 5,377 that do are numbered per file, so an id is not an address
 * even where one exists: the same number names a different person in another
 * index. Both facts bite silently -- a pipeline keyed on `id` matched 1,340
 * records for 29 findings in testing, because every undated row in a file
 * answers to the key "file#undefined".
 *
 * So a bench row is addressed by what it actually is: an entry for a named
 * person, in a named unit, holding a named role, in one index. That tuple is
 * unique for 11,928 of the 11,930 rows; the two collisions are duplicate records
 * of the same person in the same seat, which any write should treat alike anyway.
 *
 * Assigning real ids to the bench would be the better fix and is a bigger change
 * than a research pipeline should make on its way past.
 */
export const isBenchRow = (r) => r?.roleType === "subdean";

export function benchKey(file, r) {
  return [file, r.university, r.school, r.dean, r.discipline].map((s) => String(s ?? "").trim().toLowerCase()).join("|");
}
