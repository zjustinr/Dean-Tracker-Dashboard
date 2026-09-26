/**
 * Account page: who you are, what your plan covers and when it ends.
 *
 * Opened from the header's account button or a /?account link. Reads
 * /api/trial?action=account when it opens, so it always shows the org's live
 * end date and seat count. Saved searches and upgrades are placeholders until
 * those features exist; they are here so the page's shape doesn't change when
 * they arrive.
 */
import { useEffect, useState } from "react";
import { useTrial } from "@/data/TrialContext";

const CONTACT = "ren@bu.edu";
// Stripe customer-portal login link (Stripe: Settings → Billing → Customer
// portal). Monthly Pass holders manage their card, invoices and cancellation
// there. Empty = the "Manage subscription" link is hidden.
const BILLING_PORTAL_URL = "";

interface Account {
  ok: boolean;
  email: string | null;
  client: string;
  firstName: string;
  lastName: string;
  memberSince: number | null;
  plan: {
    kind: "org" | "sub" | "link";
    org: string | null;
    state: "active" | "grace" | "ended" | "suspended" | "removed";
    allIndices: boolean;
    indices: number | null;
    expiry: number | null;
    graceUntil: number | null;
    seats: number | null;
    seatsUsed: number | null;
    renews: boolean | null;
    paymentProblem: boolean;
  };
}

const fmt = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const daysUntil = (sec: number) => Math.ceil((sec * 1000 - Date.now()) / 86400000);

/** Read and strip ?account from the URL once, on load. */
function takeAccountFlag(): boolean {
  const url = new URL(location.href);
  if (!url.searchParams.has("account")) return false;
  url.searchParams.delete("account");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  return true;
}

export function useAccountDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (takeAccountFlag()) setOpen(true); }, []);
  return { open, show: () => setOpen(true), close: () => setOpen(false) };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4 border-t border-border first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{title}</h3>
      {children}
    </section>
  );
}

function PlanStatus({ plan }: { plan: Account["plan"] }) {
  if (plan.kind === "sub") {
    if (plan.state === "ended") return <p className="text-sm text-[#A31F34]">Ended{plan.expiry ? ` on ${fmt(plan.expiry)}` : ""}. You're on the free tier.</p>;
    if (plan.paymentProblem) {
      return <p className="text-sm text-amber-700 dark:text-amber-400">Your last payment didn't go through. Access continues{plan.graceUntil ? <> until <b>{fmt(plan.graceUntil)}</b></> : ""} while it's retried — update your card to keep it.</p>;
    }
    if (!plan.expiry) return <p className="text-sm text-[#1A7F4B]">Active</p>;
    return (
      <p className="text-sm">
        <span className="text-[#1A7F4B] font-semibold">Active</span>
        <span className="text-muted-foreground"> · {plan.renews ? `renews ${fmt(plan.expiry)}` : `ends ${fmt(plan.expiry)} (renewal cancelled)`}</span>
      </p>
    );
  }
  if (plan.state === "grace" && plan.graceUntil) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">Ended {plan.expiry ? fmt(plan.expiry) : ""} · full access continues until <b>{fmt(plan.graceUntil)}</b> while it's renewed.</p>;
  }
  if (plan.state === "ended") return <p className="text-sm text-[#A31F34]">Ended{plan.expiry ? ` on ${fmt(plan.expiry)}` : ""}. You're on the free tier.</p>;
  if (plan.state === "suspended" || plan.state === "removed") return <p className="text-sm text-[#A31F34]">Access is not active for this account.</p>;
  if (!plan.expiry) return <p className="text-sm text-[#1A7F4B]">Active</p>;
  const d = daysUntil(plan.expiry);
  return (
    <p className="text-sm">
      <span className="text-[#1A7F4B] font-semibold">Active</span>
      <span className="text-muted-foreground"> · through {fmt(plan.expiry)}{d <= 60 ? ` (${d} day${d === 1 ? "" : "s"} left)` : ""}</span>
    </p>
  );
}

export function AccountDialog({ dialog, onSignIn }: { dialog: ReturnType<typeof useAccountDialog>; onSignIn: () => void }) {
  const { signOut, refresh } = useTrial();
  const [acct, setAcct] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog.open) return;
    setLoading(true); setEditing(false); setError(null);
    fetch("/api/trial?action=account", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Account) => {
        setAcct(j);
        setFirst(j.firstName || ""); setLast(j.lastName || "");
        // Accounts made before names were collected: go straight to the form.
        if (j.ok && j.plan?.kind !== "link" && !j.firstName) setEditing(true);
      })
      .catch(() => setAcct(null))
      .finally(() => setLoading(false));
  }, [dialog.open]);

  if (!dialog.open) return null;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim() || !last.trim()) { setError("Please enter your first and last name."); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/trial?action=profile", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: first, lastName: last }),
      });
      const j = await r.json();
      if (j.ok) {
        setAcct((a) => (a ? { ...a, firstName: j.firstName, lastName: j.lastName } : a));
        setEditing(false);
        refresh();
      } else setError("Couldn't save your name. Please try again.");
    } catch { setError("Couldn't save your name. Please try again."); }
    setSaving(false);
  };

  const onSignOut = async () => { await signOut(); dialog.close(); };
  const signedOut = !loading && (!acct || !acct.ok);
  const plan = acct?.plan;
  const fullName = [acct?.firstName, acct?.lastName].filter(Boolean).join(" ");
  const input = "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#011F5B]/30";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-label="Account"
      onClick={dialog.close}
    >
      <div className="w-full max-w-md my-12 rounded-2xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-[#A31F34]" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <h2 className="text-xl font-bold text-foreground leading-tight">Account</h2>
            <button onClick={dialog.close} aria-label="Close" className="text-muted-foreground hover:text-foreground text-xl leading-none px-1 shrink-0">×</button>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {signedOut && (
            <div>
              <p className="text-sm text-muted-foreground">You're not signed in. Sign in with your work email if your firm has a plan, or the email you bought your Monthly Pass with.</p>
              <button onClick={() => { dialog.close(); onSignIn(); }} className="mt-4 w-full rounded-lg bg-gradient-to-b from-[#0a2a63] to-[#01143f] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110">
                Sign in
              </button>
            </div>
          )}

          {!loading && acct?.ok && plan && (
            <>
              <Section title="Profile">
                {editing ? (
                  <form onSubmit={saveName} className="space-y-2">
                    {!acct.firstName && <p className="text-xs text-muted-foreground">Add your name so we know who's using your account.</p>}
                    <div className="flex gap-2">
                      <input className={input} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" autoComplete="given-name" maxLength={60} aria-label="First name" />
                      <input className={input} value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" autoComplete="family-name" maxLength={60} aria-label="Last name" />
                    </div>
                    {error && <p className="text-xs text-[#A31F34]">{error}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={saving} className="rounded-lg bg-[#A31F34] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8c1a2c] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                      {acct.firstName && <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button>}
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {fullName && <p className="text-sm font-semibold text-foreground">{fullName}</p>}
                      <p className="text-sm text-muted-foreground break-all">{acct.email || acct.client}</p>
                      {acct.memberSince && <p className="text-xs text-muted-foreground mt-1">Member since {fmt(acct.memberSince / 1000)}</p>}
                    </div>
                    {plan.kind !== "link" && (
                      <button onClick={() => setEditing(true)} className="text-xs font-semibold text-[#011F5B] dark:text-[#AFC4E8] underline underline-offset-2 shrink-0">Edit</button>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Plan">
                <p className="text-sm font-semibold text-foreground">
                  {plan.kind === "org" ? <>Firm plan{plan.org ? <> · {plan.org}</> : null}</> : plan.kind === "sub" ? "Monthly Pass · $99/month" : "Access link"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {plan.allIndices ? "All indices, including new ones as they're added" : `${plan.indices} ${plan.indices === 1 ? "index" : "indices"}`}
                </p>
                {plan.seats && plan.seatsUsed !== null && (
                  <p className="text-sm text-muted-foreground">{plan.seatsUsed} of {plan.seats} seats in use at {plan.org}</p>
                )}
                <div className="mt-1.5"><PlanStatus plan={plan} /></div>
                {plan.kind === "org" && (
                  <p className="text-xs text-muted-foreground mt-2">Your firm manages this plan. Renewals apply to everyone automatically.</p>
                )}
                {plan.kind === "sub" && BILLING_PORTAL_URL && (
                  <a href={BILLING_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-semibold text-[#011F5B] dark:text-[#AFC4E8] underline underline-offset-2">
                    Manage subscription, card & invoices →
                  </a>
                )}
              </Section>

              <Section title="Saved searches">
                <p className="text-sm text-muted-foreground">Coming soon: save a Slate Builder or Scout search and pick it up later.</p>
              </Section>

              <Section title="Upgrades">
                <p className="text-sm text-muted-foreground">
                  Coming soon. Need more seats or a different plan?{" "}
                  <a href={`mailto:${CONTACT}?subject=${encodeURIComponent("Baton Index plan")}`} className="font-semibold text-[#011F5B] dark:text-[#AFC4E8] underline underline-offset-2">Get in touch</a>.
                </p>
              </Section>

              <div className="pt-4 border-t border-border">
                <button onClick={onSignOut} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">Sign out</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
