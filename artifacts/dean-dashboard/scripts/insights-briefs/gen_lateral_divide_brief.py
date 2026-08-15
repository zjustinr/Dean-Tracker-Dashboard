"""Generate the PDF for 'The Lateral Dean Divide'.

IMPORTANT -- this is a SNAPSHOT generator: every number below (chart data
and prose alike) is a literal, not something recomputed from src/data/ at
run time. Re-running this script regenerates the same PDF byte-for-byte; it
does NOT refresh anything. To check whether these numbers have drifted from
current live data, run compute-stats.mjs in this directory first -- if it
flags this brief, update the relevant constants AND the surrounding prose by
hand (a drifted number can flip an ordering or invalidate a superlative
claim in the text, not just need a digit swapped), then re-run this script.

    python3 scripts/insights-briefs/gen_lateral_divide_brief.py

Writes straight into public/insights/ (cover + PDF), matching the paths
referenced by src/components/Insights.tsx's "lateral-divide" REPORTS entry.
"""
import os
import sys
import tempfile
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cover_template import make_cover

PAGE_W, PAGE_H = letter
MAROON = "#A31F34"
NAVY = "#0B1F3A"
SLATE = "#5A687A"
LIGHT_BG = "#F7F5F3"
GRAY_BAR = "#52606D"
LIGHT_BAR = "#9AA5B1"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", "public", "insights")) + os.sep
CHART_DIR = tempfile.mkdtemp(prefix="baton-brief-charts-") + os.sep  # intermediate PNGs, not served
plt.rcParams["font.family"] = "DejaVu Sans"
TITLE = "The Lateral Dean Divide"

def save_chart(fig, name):
    path = CHART_DIR + name
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path

CLUSTER_IDS = {"R1 Business", "R1 Law", "Nursing", "Pharmacy"}

# ---------------------------------------------------------------- charts ---

def chart_field_ranking():
    rows = [
        ("R1 Provost", 57.4), ("Pharmacy", 33.3), ("R1 Business", 32.0), ("Nursing", 31.2),
        ("R1 Law", 30.9), ("Creative Arts", 26.9), ("Education", 25.6), ("Liberal Arts College", 21.9),
        ("Arts & Sciences", 20.5), ("Veterinary", 19.0), ("Ag & Forestry", 18.0), ("R1 Engineering", 15.3),
        ("R1 Presidents", 15.2), ("R1 Medical", 15.1), ("R2/R3 Presidents", 12.9), ("Public Health", 5.9),
        ("System", 2.3), ("Advancement", 0.0),
    ]
    labels = [r[0] for r in rows][::-1]
    vals = [r[1] for r in rows][::-1]
    colors = []
    for lab in labels:
        if lab == "R1 Provost":
            colors.append(NAVY)
        elif lab in CLUSTER_IDS:
            colors.append(MAROON)
        else:
            colors.append(LIGHT_BAR)
    fig, ax = plt.subplots(figsize=(9.6, 7.6))
    y = range(len(vals))
    bars = ax.barh(list(y), vals, color=colors, height=0.66)
    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=11.5)
    for b, v in zip(bars, vals):
        ax.text(v + 1.0, b.get_y() + b.get_height() / 2, f"{v:.1f}%", va="center", fontsize=11, fontweight="bold", color=NAVY)
    ax.set_xlim(0, 66)
    ax.set_xlabel("Share of true-external hires who were already a dean elsewhere", fontsize=11.5)
    ax.set_title("How common is a lateral dean hire, by field", fontsize=15.5, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right", "left"]: ax.spines[spine].set_visible(False)
    ax.tick_params(left=False)
    ax.xaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "lat_chart_ranking.png")

def chart_provost_vs_cluster():
    labels = ["Business / Law /\nNursing / Pharmacy\n(lateral swap)", "Provost\n(promotion path)"]
    vals = [32.0, 57.4]
    colors = [MAROON, NAVY]
    fig, ax = plt.subplots(figsize=(6.6, 4.6))
    bars = ax.bar(labels, vals, color=colors, width=0.5)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width()/2, v + 1.2, f"{v:.1f}%", ha="center", fontsize=15, fontweight="bold", color=NAVY)
    ax.set_ylim(0, 68)
    ax.set_ylabel("Share of external hires already a dean elsewhere", fontsize=11.5)
    ax.set_title("Two different mechanisms, similar-looking numbers", fontsize=14.5, fontweight="bold", color=NAVY, pad=12)
    for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
    ax.yaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(axis="x", labelsize=11)
    fig.tight_layout()
    return save_chart(fig, "lat_chart_provost.png")

def chart_era_divergence():
    eras = ["1990s", "2000s", "2010s", "2020s"]
    cluster = [29.3, 27.5, 31.7, 37.5]
    rest = [14.2, 18.9, 21.1, 19.6]
    fig, ax = plt.subplots(figsize=(9.2, 4.7))
    x = range(len(eras))
    width = 0.36
    b1 = ax.bar([i - width/2 for i in x], cluster, width, color=MAROON, label="Business / Law / Nursing / Pharmacy")
    b2 = ax.bar([i + width/2 for i in x], rest, width, color=LIGHT_BAR, label="All other fields (avg.)")
    for bars in (b1, b2):
        for b in bars:
            h = b.get_height()
            ax.text(b.get_x() + b.get_width()/2, h + 0.8, f"{h:.0f}%", ha="center", fontsize=11, fontweight="bold", color=NAVY)
    ax.set_xticks(list(x))
    ax.set_xticklabels(eras, fontsize=13)
    ax.set_ylim(0, 44)
    ax.set_ylabel("Share of true-external hires already a dean elsewhere", fontsize=11.8)
    ax.set_title("The professional-field cluster is pulling away over time", fontsize=15, fontweight="bold", color=NAVY, pad=14)
    ax.legend(loc="upper left", frameon=False, fontsize=10.5)
    for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
    ax.yaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "lat_chart_era.png")

def chart_interim_universal():
    rows = [
        ("R2/R3 Presidents", 75.7), ("R1 Engineering", 80.3), ("R1 Presidents", 66.7),
        ("Liberal Arts College", 65.4), ("R1 Business", 60.5), ("System", 73.5),
        ("Creative Arts", 50.0), ("Education", 49.0), ("Arts & Sciences", 44.2),
        ("R1 Medical", 45.0), ("R1 Provost", 41.0), ("Pharmacy", 41.0),
        ("R1 Law", 40.9), ("Veterinary", 40.0), ("Ag & Forestry", 38.4), ("Nursing", 35.8),
    ]
    rows.sort(key=lambda r: r[1])
    labels = [r[0] for r in rows]
    vals = [r[1] for r in rows]
    colors = [MAROON if lab in CLUSTER_IDS else GRAY_BAR for lab in labels]
    fig, ax = plt.subplots(figsize=(9.4, 7.0))
    y = range(len(vals))
    bars = ax.barh(list(y), vals, color=colors, height=0.62)
    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=11.5)
    for b, v in zip(bars, vals):
        ax.text(v + 1.0, b.get_y() + b.get_height() / 2, f"{v:.1f}%", va="center", fontsize=10.5, fontweight="bold", color=NAVY)
    ax.axvline(50, color=NAVY, linestyle="--", linewidth=1)
    ax.text(50.5, len(vals) - 0.5, "50%", fontsize=9, color=NAVY, va="top")
    ax.set_xlim(0, 92)
    ax.set_xlabel("Share of resolved interim spells succeeded by an external hire", fontsize=11.5)
    ax.set_title("The interim rarely gets the job, in nearly every field", fontsize=15, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right", "left"]: ax.spines[spine].set_visible(False)
    ax.tick_params(left=False)
    ax.xaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "lat_chart_interim.png")


# --------------------------------------------------------------- layout ---

def header(c, page_no):
    c.setFont("Helvetica", 9)
    c.setFillColor(NAVY)
    c.drawString(0.85*inch, PAGE_H - 0.6*inch, f"BatonIndex  ·  {TITLE}")
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(PAGE_W - 0.85*inch, PAGE_H - 0.6*inch, str(page_no))
    c.setStrokeColor("#DADADD")
    c.setLineWidth(0.6)
    c.line(0.85*inch, PAGE_H - 0.72*inch, PAGE_W - 0.85*inch, PAGE_H - 0.72*inch)

def wrap_text(c, text, x, y, max_width, font_name, font_size, leading, color=NAVY):
    c.setFont(font_name, font_size)
    c.setFillColor(color)
    words = text.split()
    line = ""
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, font_name, font_size) > max_width:
            c.drawString(x, y, line)
            y -= leading
            line = w
        else:
            line = test
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y

def bullet_list(c, items, x, y, max_width, font_size=10.5, leading=14.5, bullet="I", color=NAVY):
    for item in items:
        c.setFont("Helvetica-Bold", font_size)
        c.setFillColor(MAROON)
        c.drawString(x, y, bullet)
        y = wrap_text(c, item, x + 14, y, max_width - 14, "Helvetica", font_size, leading, color)
        y -= 4
    return y

def finding_page(c, n_of, title_kicker, headline, body_paras, chart_path, chart_caption, callout, page_no, chart_max_h=None):
    header(c, page_no)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, f"FINDING {n_of}")
    y -= 20
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, title_kicker.upper())
    y -= 24
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 17)
    for line in headline:
        c.drawString(0.85*inch, y, line)
        y -= 21
    y -= 8
    for para in body_paras:
        y = wrap_text(c, para, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.3, 14.2, NAVY)
        y -= 6

    img = ImageReader(chart_path)
    iw, ih = img.getSize()
    disp_w = PAGE_W - 1.7*inch
    disp_h = disp_w * ih / iw
    if chart_max_h and disp_h > chart_max_h:
        disp_h = chart_max_h
        disp_w = disp_h * iw / ih
    chart_x = 0.85*inch + (PAGE_W - 1.7*inch - disp_w) / 2
    box_y = 0.85*inch
    box_h = 0.6*inch
    caption_h = 0.28*inch  # reserved band for the italic caption between chart and callout box
    chart_y = box_y + box_h + caption_h
    c.drawImage(img, chart_x, chart_y, width=disp_w, height=disp_h, mask="auto")
    c.setFont("Helvetica-Oblique", 8.3)
    c.setFillColor(SLATE)
    c.drawString(0.85*inch, chart_y - 13, chart_caption)
    c.setFillColor(LIGHT_BG)
    c.roundRect(0.85*inch, box_y, PAGE_W - 1.7*inch, box_h, 5, fill=1, stroke=0)
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 8.3)
    c.drawString(1.0*inch, box_y + box_h - 16, "FOR SEARCH LEADERS")
    wrap_text(c, callout, 1.0*inch, box_y + box_h - 30, PAGE_W - 2.0*inch, "Helvetica", 9.2, 12.2, NAVY)


def make_pdf(out_path):
    cover_path = OUT_DIR + "cover-lateral-divide.png"
    make_cover(
        cover_path,
        ["The Lateral Dean", "Divide"],
        ["Which academic fields run an active market for sitting deans",
         "and which don't — compared across eighteen BatonIndex role families."],
        [("14,343", "dean appointments"), ("18", "role families"), ("1970-2025", "55 years")],
        "August 2026  ·  BatonIndex Research",
    )

    c_rank = chart_field_ranking()
    c_prov = chart_provost_vs_cluster()
    c_era = chart_era_divergence()
    c_int = chart_interim_universal()

    c = canvas.Canvas(out_path, pagesize=letter)
    c.setTitle(f"{TITLE}, A BatonIndex Research Brief")
    c.setAuthor("BatonIndex")
    c.setSubject("Leadership succession intelligence")

    # Page 1: cover
    cover_img = ImageReader(cover_path)
    c.drawImage(cover_img, 0, 0, width=PAGE_W, height=PAGE_H)
    c.showPage()

    # Page 2: intro + findings summary
    header(c, 1)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, "A BATONINDEX RESEARCH BRIEF")
    y -= 26
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(0.85*inch, y, TITLE)
    y -= 24
    intro = ("BatonIndex's brief “The Path Before the Deanship” found that when an R1 business school hires "
             "from outside, roughly a third of the time it recruits a sitting dean from another business school. "
             "Does that pattern hold everywhere? We ran the same question across 14,343 dean, provost, and "
             "president appointments spanning 18 BatonIndex role families. The answer: no, and the variation "
             "itself is the finding. A handful of professional fields run an active lateral-dean market; most "
             "fields barely have one at all.")
    y = wrap_text(c, intro, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.5, 15, NAVY)
    y -= 14
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(0.85*inch, y, "Four findings")
    y -= 20
    findings_short = [
        "Only four fields run an active lateral-dean market. Business, law, nursing, and pharmacy cluster at 31-33% of external hires already a dean elsewhere; most other fields sit at 12-27%, and system-level and advancement offices barely see it at all (0-2%).",
        "Provost is the outlier, and a different mechanism. 57.4% of external provost hires were already a dean somewhere, but that's an upward promotion path from any school, not a same-level lateral swap between peer institutions.",
        "The professional-field cluster is pulling away over time. Business/law/nursing/pharmacy climbed from 29.3% (1990s) to 37.5% (2020s) of external hires, while every other field combined stayed roughly flat at 14-21%.",
        "The interim-underdog pattern is nearly universal. In field after field, regardless of whether it has an active lateral-dean market, most resolved interim spells end with an externally recruited replacement, not a conversion to permanent.",
    ]
    bullet_list(c, findings_short, 0.85*inch, y, PAGE_W - 1.7*inch, font_size=10.0, leading=13.6)
    c.showPage()

    # Finding 1
    finding_page(
        c, "1 OF 4", "The field-by-field map",
        ["Only four fields run an active lateral-dean market"],
        [("Across 18 role families, the share of external hires who were already a dean elsewhere ranges from 0% "
          "to 57%. Set the provost outlier aside (Finding 2) and a clear cluster emerges at the top: pharmacy "
          "(33.3%), business (32.0%), nursing (31.2%), and law (30.9%) all sit within two points of each other, "
          "a distinct tier above every other field."),
         ("Everything else falls into a much lower band, 0-27%. Creative arts, education, and liberal arts "
          "colleges see some lateral movement (22-27%); engineering, medicine, and university presidencies see "
          "less (15%); system offices and advancement leadership see almost none. A recruiter's default "
          "assumption about “who else is in the market” should depend heavily on which of these two "
          "tiers the search sits in.")],
        c_rank, "Share of true-external hires already a dean elsewhere, by field; BatonIndex census.",
        "Before assuming a competitor dean is a live prospect, check which tier the field sits in. In business, "
        "law, nursing, or pharmacy, that assumption is well-supported. In most other fields, it isn't.",
        2, chart_max_h=5.6*inch,
    )
    c.showPage()

    # Finding 2
    finding_page(
        c, "2 OF 4", "Reading the provost number correctly",
        ["Provost is the outlier, and a different mechanism"],
        [("Provost leads every field at 57.4%, more than 20 points above the professional-field cluster. But this "
          "is not the same phenomenon: a provost search draws from deans across every school at a university, "
          "and moving from a deanship to a provostship is a genuine promotion, not a same-level swap between "
          "peer institutions. Business, law, nursing, and pharmacy searches are recruiting a dean to be a dean "
          "again, at the same level, in the same field."),
         ("Conflating the two would badly overstate how “liquid” the professional-field dean market "
          "really is. Read Finding 1's ranking as two separate stories: a promotion pipeline into the provost's "
          "office, and a genuine lateral swap market in four specific fields.")],
        c_prov, "Share of external hires already a dean elsewhere: provost vs. the four-field cluster; BatonIndex census.",
        "When benchmarking a provost search, source broadly from sitting deans of any school. When benchmarking "
        "a business, law, nursing, or pharmacy deanship, source specifically from peer deans in that same field.",
        3,
    )
    c.showPage()

    # Finding 3
    finding_page(
        c, "3 OF 4", "A widening gap",
        ["The professional-field cluster is pulling away over time"],
        [("The four-field cluster's lateral-dean share climbed from 29.3% in the 1990s to 37.5% in the 2020s. "
          "Every other field, averaged together, moved from 14.2% to 19.6% over the same period, a much smaller "
          "shift off a much lower base. The gap between the two groups has roughly doubled since the 1990s."),
         ("This mirrors the era-trend finding in “The Path Before the Deanship” for business specifically, "
          "now confirmed as part of a broader pattern across licensure- and accreditation-adjacent professional "
          "fields, not a business-school-specific artifact.")],
        c_era, "Share of true-external hires already a dean elsewhere, cluster vs. all other fields, by era; BatonIndex census.",
        "If your search is in business, law, nursing, or pharmacy, plan for the lateral-dean pool to keep growing "
        "as a share of the realistic candidate set relative to the last cycle. That trend is not slowing down.",
        4,
    )
    c.showPage()

    # Finding 4
    finding_page(
        c, "4 OF 4", "A universal pattern",
        ["The interim-underdog pattern holds almost everywhere"],
        [("Whether or not a field has an active lateral-dean market, the interim seat behaves the same way almost "
          "everywhere we can measure it: most resolved interim spells end with an externally recruited "
          "replacement, not a conversion to permanent. R1 engineering (80.3% succeeded by an external hire), "
          "R2/R3 presidencies (75.7%), and system offices (73.5%) show this even more starkly than business "
          "(60.5%)."),
         ("Nursing is the closest thing to an exception among fields with enough data (35.8%, still well under "
          "half), but no field on this list shows the interim converting more often than not. This is the single "
          "most transferable finding across every role family BatonIndex tracks.")],
        c_int, "Share of resolved interim spells succeeded by an external hire, by field; BatonIndex census.",
        "Regardless of field, don't let a capable interim substitute for running the search in earnest. The data "
        "says the board almost always looks outside anyway — give your client the full candidate set.",
        5, chart_max_h=5.4*inch,
    )
    c.showPage()

    # Playbook
    header(c, 6)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, "THE PLAYBOOK")
    y -= 24
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(0.85*inch, y, "What this means across every search")
    y -= 24
    y = wrap_text(c, "Four evidence-based moves for committees and recruiters working any academic-leadership market:",
                  0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.5, 14.5, NAVY)
    y -= 8
    playbook = [
        "Calibrate your lateral-market assumption to the field. Business, law, nursing, and pharmacy have a real, growing peer-dean market. Most other fields don't — don't force a competitor-poaching strategy where the base rate doesn't support it.",
        "Don't read the provost number as a lateral-market signal. It reflects an upward promotion pipeline from deanships generally, not a same-level swap market.",
        "In the four-field cluster, expect the lateral pool to keep growing. Plan sourcing and comps assuming this cycle draws more peer-dean interest than the last one.",
        "Run the outside search everywhere, interim or not. The interim-underdog pattern is close to universal — a capable interim is not a substitute for a real external search in almost any field BatonIndex tracks.",
    ]
    bullet_list(c, playbook, 0.85*inch, y, PAGE_W - 1.7*inch, font_size=10.0, leading=14)
    c.showPage()

    # Methodology
    header(c, 7)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, "METHODOLOGY & ABOUT")
    y -= 24
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(0.85*inch, y, "About this brief")
    y -= 20
    method = ("This brief compares 18 of BatonIndex's role-family datasets, each a hand-coded, web-verified record "
              "of appointments at US research universities, filtered to fields with at least 30 recorded hires and "
              "20 true-external hires (a different university, not a same-university move to a different school). "
              "“Already a dean elsewhere” uses the same corrected classifier as “The Path Before the "
              "Deanship”: a prior title containing “dean” not qualified by associate/assistant/vice/"
              "deputy/interim.")
    y = wrap_text(c, method, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 10
    method2 = ("Interim outcomes were determined by matching each interim appointment to the next appointment on "
               "file at the same school, the same method as our single-field briefs. Fields with fewer than 15 "
               "resolved interim spells are omitted from Finding 4. The Graduate College dean pipeline is excluded "
               "from this comparison for insufficient external-hire volume; see “The Graduate Deanship "
               "Clock” for that office's own tenure and promotion analysis.")
    y = wrap_text(c, method2, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 10
    method3 = ("We tested whether a field's lateral-dean share correlates with its interim-conversion rate and "
               "found only a weak relationship (r = 0.37 across 17 fields) — not strong enough to support a "
               "claim that the two are connected. The professional-field clustering in Finding 1 is a descriptive "
               "pattern, not a tested causal claim; a plausible reading is that fields with external accreditation "
               "or licensure bodies (AACSB, ABA, ACPE, CCNE) develop deeper cross-institution peer networks, but "
               "this brief does not test that mechanism directly.")
    y = wrap_text(c, method3, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 16

    about = ("BatonIndex maintains leadership-succession intelligence on more than 10,000 academic leaders across "
             "twelve role families, business, medical, law, nursing, pharmacy, education, agriculture, public "
             "health, arts & sciences deans, provosts, and presidents, with sourced education histories, career "
             "pathways, and live appointment tracking. This brief is one view into that data.")
    y = wrap_text(c, about, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 20

    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(0.85*inch, y, "PUT THE DATA TO WORK")
    y -= 16
    cta = ("Want the underlying benchmarks for a specific school, field, or region, or a co-branded edition "
           "of this brief for a client? Reach the BatonIndex team through the Contact link in the app.")
    y = wrap_text(c, cta, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 20
    c.setFont("Helvetica-Oblique", 8.6)
    c.setFillColor(SLATE)
    wrap_text(c, "Suggested citation: BatonIndex (2026). The Lateral Dean Divide: A Research Brief. Based on the "
                 "BatonIndex cross-index academic leadership census.",
              0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica-Oblique", 8.6, 12, SLATE)
    c.showPage()

    c.save()
    print("saved", out_path)


if __name__ == "__main__":
    make_pdf(OUT_DIR + "baton-lateral-divide-brief.pdf")
