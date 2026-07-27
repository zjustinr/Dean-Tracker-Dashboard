import { useState } from "react";

/**
 * Contact form.
 *
 * This app is a static build with no server of its own, so the form needs an
 * endpoint supplied at build time:
 *
 *   VITE_CONTACT_ENDPOINT  a URL that accepts a JSON POST (Formspree,
 *                          Web3Forms, or a Vercel function). Preferred.
 *   VITE_CONTACT_EMAIL     fallback -- submitting opens the visitor's mail
 *                          client with the message prefilled.
 *
 * If neither is set the form still renders but says so plainly rather than
 * silently swallowing what someone typed, which is the failure mode that loses
 * a lead without anyone noticing.
 */
const ENDPOINT = import.meta.env.VITE_CONTACT_ENDPOINT as string | undefined;
// Default so the form works with no deployment configuration. Setting
// VITE_CONTACT_ENDPOINT later takes precedence and avoids exposing the address
// in the bundle at all.
const EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || "ren@bu.edu";

type State = "idle" | "sending" | "sent" | "error";

export default function ContactDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>("idle");
  const [err, setErr] = useState("");

  const configured = Boolean(ENDPOINT || EMAIL);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) return;
    setState("sending");
    setErr("");
    const payload = { name, email, firm, message, source: "batonindex" };
    try {
      if (ENDPOINT) {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        setState("sent");
      } else {
        const body = `${message}\n\n--\n${name}${firm ? `, ${firm}` : ""}\n${email}`;
        window.location.href =
          `mailto:${EMAIL}?subject=${encodeURIComponent(`BatonIndex enquiry -- ${name || "website"}`)}` +
          `&body=${encodeURIComponent(body)}`;
        setState("sent");
      }
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : "failed");
    }
  }

  const field = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Contact BatonIndex"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold">Get in touch</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Questions about coverage, licensing, or a trial.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        {state === "sent" ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium">Thank you — your message is on its way.</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-4 space-y-3">
            <input className={field} placeholder="Name" value={name}
              onChange={(e) => setName(e.target.value)} required />
            <input className={field} type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
            <input className={field} placeholder="Firm (optional)" value={firm}
              onChange={(e) => setFirm(e.target.value)} />
            <textarea className={field + " min-h-[96px] resize-y"} placeholder="How can we help?"
              value={message} onChange={(e) => setMessage(e.target.value)} required />

            {!configured && (
              <p className="text-xs text-[#A31F34]">
                This form is not connected yet. Set <code>VITE_CONTACT_ENDPOINT</code> or{" "}
                <code>VITE_CONTACT_EMAIL</code> before going live.
              </p>
            )}
            {state === "error" && (
              <p className="text-xs text-[#A31F34]">Could not send ({err}). Please try again.</p>
            )}

            <button
              type="submit"
              disabled={!configured || state === "sending"}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                         hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state === "sending" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
