import { useState } from "react";

/**
 * About / methodology dialog.
 *
 * A one-person shop is an asset for this product, not a liability: the buyer is
 * a search consultant who trusts a named academic expert over an anonymous data
 * vendor. So the page is credential-forward and honest -- real name, real
 * institution, and the fact that the author is himself a sitting department
 * chair at a business school, which is the most relevant possible qualification
 * for a dean-succession product. It also carries the methodology statement a
 * data buyer expects.
 *
 * Headshot: drop the photo at public/ren-headshot.jpg. If it's missing the
 * component falls back to a monogram rather than a broken image.
 */
export default function AboutDialog({ onClose, onContact }: { onClose: () => void; onContact: () => void }) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="About BatonIndex"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <h2 className="text-lg font-bold">About BatonIndex</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            BatonIndex is a research project tracking leadership succession across
            U.S. higher education — {" "}
            <span className="font-semibold text-foreground">10,000+ appointments</span> at
            more than 1,800 schools, compiled from primary sources.
          </p>

          <div className="flex items-start gap-4 pt-1">
            {imgOk ? (
              <img
                src="/ren-headshot.jpg"
                alt="Z. Justin Ren"
                className="w-20 h-20 rounded-full object-cover border-2 border-[#011F5B]/20 shrink-0"
                onError={() => setImgOk(false)}
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#011F5B] text-white flex items-center justify-center text-xl font-bold shrink-0">
                ZR
              </div>
            )}
            <div>
              <p className="font-bold text-base leading-tight">Z. Justin Ren, Ph.D.</p>
              <p className="text-muted-foreground mt-0.5">
                Associate Professor &amp; Chair, Operations &amp; Technology Management<br />
                Questrom School of Business, Boston University
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Ph.D., The Wharton School, University of Pennsylvania
              </p>
            </div>
          </div>

          <p>
            The index is built and maintained by Professor Ren, a tenured faculty
            member and <span className="font-semibold">sitting department chair</span> at
            a business school — an academic administrator studying the very
            transitions this database tracks. His research and two decades of
            consulting center on operations, analytics, and the data behind how
            organizations are led.
          </p>

          <div>
            <p className="font-semibold text-foreground mb-1">Methodology</p>
            <p className="text-muted-foreground">
              Every record is assembled from primary sources — official university
              announcements, institutional bios, and public filings — then
              cross-checked. The data is refreshed continuously; the "updated" date
              in the header reflects the latest deployment. BatonIndex is
              independent: it is not affiliated with any search firm, and has no
              stake in who is placed where.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => { onClose(); onContact(); }}
              className="px-4 py-2 rounded-lg bg-gradient-to-b from-[#b02a3f] to-[#8a1a2d] text-white text-sm font-semibold shadow-sm hover:brightness-110"
            >
              Get in touch
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
