import { useEffect, useRef, useState } from "react";
// html2canvas proper chokes on oklch()/color-mix() colors, which is Tailwind v4's
// default palette (every gradient in this app, header and buttons, uses them), so
// a capture would throw before it ever finishes. html2canvas-pro is the maintained
// fork that adds modern color-function support; same API, drop-in swap.
import html2canvas from "html2canvas-pro";

/**
 * Always-on "Suggest a feature" widget. A pill button floats in the lower-right
 * corner, above the free-tier meter badge that lives in the same corner; clicking
 * it opens a compose panel just above the button. Sending (click or Enter)
 * rasterizes the current viewport with html2canvas and POSTs the
 * note, the visitor's email (optional), and the screenshot to
 * /api/feature-request, which relays it by email (see that file for the env
 * vars it needs). Screenshot capture is best-effort: if it throws, the text
 * still gets sent.
 */
const LEADING = "I wish this page has this feature... ";
const WIDGET_ATTR = "data-feature-widget";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Status = "idle" | "sending" | "sent" | "error";

// Best-effort label for "what were they looking at" (reads the currently
// selected dataset chip and module tab straight from the DOM, so this widget
// needs no wiring into App.tsx's tab state).
function currentPageLabel(): string {
  const parts = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
    .map((el) => el.textContent?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : document.title || "BatonIndex";
}

async function captureScreenshot(): Promise<string | null> {
  try {
    const canvas = await html2canvas(document.body, {
      // Crop to the current viewport at the current scroll position. Passing
      // scrollX/scrollY here too (as an earlier version did) double-compensates
      // against x/y and crops to a tiny, wrongly-positioned sliver -- x/y alone
      // is the documented way to capture just what's on screen.
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      scale: Math.min(1, 1600 / window.innerWidth),
      useCORS: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      ignoreElements: (el) => el instanceof HTMLElement && el.hasAttribute(WIDGET_ATTR),
    });
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null; // never let a capture failure block sending the note itself
  }
}

export default function FeatureRequestWidget() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(LEADING);
  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset to a clean compose state each time the panel opens, and put the
  // cursor after the leading phrase so typing continues the sentence.
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setMessage(LEADING);
    setStatus("idle");
    setHint("");
    const t = window.setTimeout(() => {
      const el = textareaRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Outside click closes the panel, but not while a send is in flight.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (status === "sending") return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, status]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (status === "sending") return;
    if (message.trim().length <= LEADING.trim().length) {
      setHint("Tell us a bit about what you'd like to see.");
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setHint("That email doesn't look right (or leave it blank).");
      return;
    }
    setHint("");
    setStatus("sending");
    const screenshot = await captureScreenshot();
    try {
      const res = await fetch("/api/feature-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          message: message.trim(),
          screenshot: screenshot || "",
          pageUrl: window.location.href,
          pageTitle: currentPageLabel(),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div {...{ [WIDGET_ATTR]: "true" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed bottom-14 right-4 z-40 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5
                   bg-[#A31F34]/40 backdrop-blur-sm text-white text-xs font-semibold
                   shadow-lg hover:bg-[#A31F34]/55 transition-all"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
        </svg>
        Suggest a feature
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Suggest a feature"
          className="fixed bottom-28 right-4 z-50 w-[min(92vw,380px)] rounded-xl border border-border
                     bg-card shadow-xl"
        >
          <div className="flex items-start justify-between px-4 pt-4">
            <div>
              <h2 className="text-sm font-semibold">Suggest a feature</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                We'll include a screenshot of this screen.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
            >
              ×
            </button>
          </div>

          {status === "sent" ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium">Thanks, we've got it.</p>
              {email.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  We'll let you know at {email.trim()} if we build it.
                </p>
              )}
              <button
                onClick={() => setOpen(false)}
                className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="px-4 py-3 space-y-2.5">
              <input
                type="email"
                className={field}
                placeholder="Enter your email if you'd like to be notified when the feature is available"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <textarea
                ref={textareaRef}
                className={field + " min-h-[120px] resize-y"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={onTextareaKeyDown}
              />
              <p className="text-[11px] text-muted-foreground">
                Press Enter to send, Shift+Enter for a new line.
              </p>

              {hint && <p className="text-xs text-[#A31F34]">{hint}</p>}
              {status === "error" && (
                <p className="text-xs text-[#A31F34]">Couldn't send that. Please try again.</p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                           hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
