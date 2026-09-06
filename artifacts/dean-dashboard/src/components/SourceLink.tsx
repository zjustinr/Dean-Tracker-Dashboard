/**
 * The source behind a row, shown on the row.
 *
 * Every leadership record carries the URL it was researched from -- 97.5%
 * corpus-wide, 99.6% in the R1 business index, and a CI check
 * (scripts/validate-source-urls.mjs) blocks new records without one. Until now
 * that only paid off inside an opened profile: a reader scanning a list had to
 * take the rows on trust. Showing the domain per row is what turns the coverage
 * into something a research-minded reader can actually check, and it costs one
 * line.
 *
 * The domain, not the bare word "source", because WHICH domain is the whole
 * signal -- a university newsroom and an aggregator blog are not the same claim.
 * A record with nothing on file says so plainly rather than rendering nothing,
 * since a silent gap reads as "sourced" to anyone not counting.
 */

/** "https://nursing.umaryland.edu/museum/..." -> "umaryland.edu". */
export function sourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    const parts = host.split(".");
    // Keep three labels for a two-part public suffix (.co.uk, .ac.uk), two otherwise.
    const keep = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length <= 3 ? 3 : 2;
    return parts.slice(-keep).join(".");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
}

export default function SourceLink({ url, subject, className = "" }: {
  url?: string | null;
  /** Whose record this is, for the link's accessible name. */
  subject?: string;
  className?: string;
}) {
  if (!url) {
    return (
      <span className={`text-[10px] text-muted-foreground/70 italic shrink-0 ${className}`} title="No source URL on file for this record yet.">
        no source
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      // The row itself is a click target that expands the profile; following the
      // source must not also open the row underneath it.
      onClick={(e) => e.stopPropagation()}
      title={url}
      aria-label={subject ? `Source for ${subject} (opens in a new tab)` : "Source (opens in a new tab)"}
      className={`text-[10px] text-primary hover:underline underline-offset-2 shrink-0 max-w-[9rem] truncate ${className}`}
    >
      {sourceDomain(url)} ↗
    </a>
  );
}
