// Read and write the dean datasets without reformatting them.
//
// The files are not uniformly formatted: most use a one-space indent, deans.json
// uses two, and several (r1-agschool, r1-education, r1-nursing, r1-system) are
// minified onto a single line. Rewriting one in a different shape turns a
// handful of changed fields into a whole-file diff -- ~90,000 lines for one
// minified file -- which buries the actual change in review.
//
// Detection has to include the minified form explicitly: falling back to an
// indent when no indented form matches is exactly what silently reflows those
// four files.

import fs from 'node:fs';

/**
 * Returns the indent that reproduces `src` from `parsed`, or null when the
 * source is minified. Used as an opaque token by `serialize`.
 */
export function detectIndent(src, parsed) {
  const trimmed = src.trim();
  if (JSON.stringify(parsed) === trimmed) return null;   // minified
  for (const ind of [1, 2, 4, '\t']) {
    if (JSON.stringify(parsed, null, ind) === trimmed) return ind;
  }
  return 1; // unrecognised: the prevailing style in this directory
}

export function serialize(parsed, indent) {
  return indent === null ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent);
}

/** Read a dataset, remembering how it was formatted. */
export function readDataset(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rows = JSON.parse(src);
  return { rows, indent: detectIndent(src, rows) };
}

/** Write a dataset back in the shape it arrived in. */
export function writeDataset(file, rows, indent) {
  fs.writeFileSync(file, serialize(rows, indent));
}
