"""Generate the PDF for 'The Path Before the Deanship'.

IMPORTANT -- this is a SNAPSHOT generator: every number below (chart data
and prose alike) is a literal, not something recomputed from src/data/ at
run time. Re-running this script regenerates the same PDF byte-for-byte; it
does NOT refresh anything. To check whether these numbers have drifted from
current live data, run compute-stats.mjs in this directory first -- if it
flags this brief, update the relevant constants AND the surrounding prose by
hand (a drifted number can flip an ordering or invalidate a superlative
claim in the text, not just need a digit swapped), then re-run this script.

    python3 scripts/insights-briefs/gen_prior_position_brief.py

Writes straight into public/insights/ (cover + PDF), matching the paths
referenced by src/components/Insights.tsx's "prior-position" REPORTS entry.
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
TITLE = "The Path Before the Deanship"

def save_chart(fig, name):
    path = CHART_DIR + name
    fig.savefig(path, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path

# ---------------------------------------------------------------- charts ---

def chart_population():
    # Horizontal stacked single bar: internal vs external, then external split
    fig, ax = plt.subplots(figsize=(9.4, 2.6))
    internal, external = 56.4, 43.2
    ax.barh([0], [internal], color=GRAY_BAR, height=0.5, label="Internal promotion")
    ax.barh([0], [external], left=[internal], color=MAROON, height=0.5, label="External hire")
    ax.text(internal / 2, 0, f"Internal\n{internal:.0f}%", ha="center", va="center", color="white", fontsize=13, fontweight="bold")
    ax.text(internal + external / 2, 0, f"External\n{external:.0f}%", ha="center", va="center", color="white", fontsize=13, fontweight="bold")
    ax.set_xlim(0, 100)
    ax.set_ylim(-0.6, 0.6)
    ax.set_yticks([])
    ax.set_xlabel("Share of all 796 R1 business-dean appointments, 1990-2025", fontsize=11)
    ax.set_title("Who fills the seat: internal promotion vs. external hire", fontsize=15, fontweight="bold", color=NAVY, pad=12)
    for spine in ax.spines.values(): spine.set_visible(False)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_population.png")

def chart_prior_position():
    labels = ["Associate /\nVice Dean", "Dean, another\nbusiness school", "Faculty only\n(no admin title)",
               "Industry\nexecutive", "Dean, different\nkind of school", "Other /\nunclassified", "Department\nChair"]
    vals = [26.7, 25.0, 16.3, 14.0, 7.0, 6.4, 4.7]
    colors = [MAROON if i in (0, 1) else GRAY_BAR for i in range(len(vals))]
    fig, ax = plt.subplots(figsize=(9.4, 4.8))
    y = range(len(vals))
    bars = ax.barh(list(y)[::-1], vals, color=colors, height=0.62)
    ax.set_yticks(list(y)[::-1])
    ax.set_yticklabels(labels, fontsize=13)
    for b, v in zip(bars, vals):
        ax.text(v + 0.6, b.get_y() + b.get_height() / 2, f"{v:.1f}%", va="center", fontsize=13, fontweight="bold", color=NAVY)
    ax.set_xlim(0, 32)
    ax.set_xlabel("Share of true-external hires (n=344)", fontsize=12.5)
    ax.set_title("What an external hire was doing right before the deanship", fontsize=15.5, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right", "left"]: ax.spines[spine].set_visible(False)
    ax.tick_params(left=False)
    ax.xaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_prior_position.png")

def chart_spotlight_donut():
    fig, ax = plt.subplots(figsize=(6.0, 6.0))
    vals = [78.2, 21.8]
    labels = ["Another\nbusiness school\n78.2%", "A different kind\nof school\n21.8%"]
    colors = [MAROON, LIGHT_BAR]
    wedges, _ = ax.pie(vals, colors=colors, startangle=90, counterclock=False,
                        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=3))
    ax.text(0, 0.06, "110", ha="center", va="center", fontsize=30, fontweight="bold", color=NAVY)
    ax.text(0, -0.14, "dean-elsewhere hires", ha="center", va="center", fontsize=11, color=SLATE)
    ax.legend(wedges, labels, loc="upper center", bbox_to_anchor=(0.5, -0.02), ncol=1, frameon=False, fontsize=12.5)
    ax.set_title("Of the outside hires who were already a dean somewhere,\nwhere was that?", fontsize=14.5, fontweight="bold", color=NAVY, pad=10)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_spotlight.png")

def chart_era_trend_grouped():
    eras = ["1990s", "2000s", "2010s", "2020s"]
    same = [10, 15, 38, 23]
    other = [7, 7, 4, 6]
    totals = [62, 85, 121, 74]
    same_pct = [100 * s / t for s, t in zip(same, totals)]
    other_pct = [100 * o / t for o, t in zip(other, totals)]
    fig, ax = plt.subplots(figsize=(9.2, 4.6))
    x = range(len(eras))
    width = 0.36
    b1 = ax.bar([i - width/2 for i in x], same_pct, width, color=MAROON, label="Dean, another business school")
    b2 = ax.bar([i + width/2 for i in x], other_pct, width, color=LIGHT_BAR, label="Dean, different kind of school")
    for bars in (b1, b2):
        for b in bars:
            h = b.get_height()
            ax.text(b.get_x() + b.get_width()/2, h + 0.6, f"{h:.0f}%", ha="center", fontsize=11, fontweight="bold", color=NAVY)
    ax.set_xticks(list(x))
    ax.set_xticklabels(eras, fontsize=13)
    ax.set_ylim(0, 36)
    ax.set_ylabel("Share of true-external hires", fontsize=12.5)
    ax.set_title("The growth is entirely in same-type lateral moves", fontsize=15, fontweight="bold", color=NAVY, pad=14)
    ax.legend(loc="upper left", frameon=False, fontsize=11)
    for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
    ax.yaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_era_trend.png")

def chart_interim_outcomes():
    labels = ["Succeeded by an\nexternal sitting/former dean", "Succeeded by a different\ninternal promotion",
               "Converted to permanent\n(same person, same school)", "Succeeded by\nanother interim"]
    vals = [60.8, 16.8, 17.2, 5.2]
    colors = [GRAY_BAR, GRAY_BAR, MAROON, GRAY_BAR]
    fig, ax = plt.subplots(figsize=(9.2, 4.6))
    y = range(len(vals))
    bars = ax.barh(list(y)[::-1], vals, color=colors, height=0.55)
    ax.set_yticks(list(y)[::-1])
    ax.set_yticklabels(labels, fontsize=13.5)
    for b, v in zip(bars, vals):
        ax.text(v + 1.2, b.get_y() + b.get_height()/2, f"{v:.1f}%", va="center", fontsize=13.5, fontweight="bold", color=NAVY)
    ax.set_xlim(0, 72)
    ax.set_xlabel("Share of resolved interim appointments (n=232)", fontsize=12.5)
    ax.set_title("What actually happens after an interim dean's term", fontsize=15.5, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right", "left"]: ax.spines[spine].set_visible(False)
    ax.tick_params(left=False)
    ax.xaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_interim.png")

def chart_tenure():
    labels = ["Dean, different\nkind of school", "Dean, another\nbusiness school", "Associate /\nVice Dean",
              "Department\nChair", "Other", "Industry\nexecutive", "Faculty only"]
    vals = [6.0, 6.3, 6.3, 6.8, 7.2, 7.2, 7.4]
    colors = [MAROON] + [GRAY_BAR]*6
    fig, ax = plt.subplots(figsize=(9.2, 4.6))
    y = range(len(vals))
    bars = ax.barh(list(y)[::-1], vals, color=colors, height=0.6)
    ax.set_yticks(list(y)[::-1])
    ax.set_yticklabels(labels, fontsize=13.5)
    for b, v in zip(bars, vals):
        ax.text(v + 0.1, b.get_y() + b.get_height()/2, f"{v:.1f} yrs", va="center", fontsize=13, fontweight="bold", color=NAVY)
    ax.set_xlim(0, 8.6)
    ax.set_xlabel("Average tenure length (years)", fontsize=12.5)
    ax.set_title("Recruits from outside the discipline get the shortest tenure", fontsize=14.5, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right", "left"]: ax.spines[spine].set_visible(False)
    ax.tick_params(left=False)
    ax.xaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_tenure.png")

def chart_industry_trend():
    eras = ["1990s", "2000s", "2010s", "2020s"]
    vals = [29.0, 20.0, 15.7, 13.5]
    fig, ax = plt.subplots(figsize=(9.0, 4.3))
    colors = [MAROON, GRAY_BAR, GRAY_BAR, GRAY_BAR]
    bars = ax.bar(eras, vals, color=colors, width=0.55)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width()/2, v + 1.0, f"{v:.1f}%", ha="center", fontsize=14, fontweight="bold", color=NAVY)
    ax.set_ylim(0, 36)
    ax.set_ylabel("Share of external hires with an\nindustry/executive background", fontsize=12.5)
    ax.set_title("The industry channel has shrunk as the lateral-dean channel grew", fontsize=14.5, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
    ax.yaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(axis="x", labelsize=13.5)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_industry.png")

def chart_gender():
    labels = ["All hires\n(internal + external)", "External hires\noverall", "Dean-to-dean\nlateral hires"]
    vals = [20.1, 22.4, 28.2]
    colors = [GRAY_BAR, GRAY_BAR, MAROON]
    fig, ax = plt.subplots(figsize=(7.6, 4.3))
    bars = ax.bar(labels, vals, color=colors, width=0.5)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width()/2, v + 0.8, f"{v:.1f}%", ha="center", fontsize=14, fontweight="bold", color=NAVY)
    ax.set_ylim(0, 34)
    ax.set_ylabel("Female share", fontsize=12.5)
    ax.set_title("The lateral-dean channel favors women, if anything", fontsize=15, fontweight="bold", color=NAVY, pad=14)
    for spine in ["top", "right"]: ax.spines[spine].set_visible(False)
    ax.yaxis.grid(True, color="#E3E3E8", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(axis="x", labelsize=12.5)
    fig.tight_layout()
    return save_chart(fig, "v2_chart_gender.png")


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

def finding_page(c, n_of, title_kicker, headline, body_paras, chart_path, chart_caption, callout, page_no, extra_box=None):
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
    chart_y = max(1.85*inch, y - disp_h - 0.15*inch)
    # if chart would overlap the callout box floor, shrink from the top instead
    chart_y = 1.85*inch
    c.drawImage(img, 0.85*inch, chart_y, width=disp_w, height=disp_h, mask="auto")
    c.setFont("Helvetica-Oblique", 8.3)
    c.setFillColor(SLATE)
    c.drawString(0.85*inch, chart_y - 13, chart_caption)

    box_y = 0.85*inch
    box_h = 0.72*inch
    c.setFillColor(LIGHT_BG)
    c.roundRect(0.85*inch, box_y, PAGE_W - 1.7*inch, box_h, 5, fill=1, stroke=0)
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 8.3)
    c.drawString(1.0*inch, box_y + box_h - 16, "FOR SEARCH LEADERS")
    wrap_text(c, callout, 1.0*inch, box_y + box_h - 30, PAGE_W - 2.0*inch, "Helvetica", 9.3, 12.5, NAVY)

def spotlight_page(c, n_of, title_kicker, headline, body_paras, chart_path, examples, page_no, callout):
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
    y -= 6
    for para in body_paras:
        y = wrap_text(c, para, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.3, 14.2, NAVY)
        y -= 6

    # Named-examples box height driven by content (2 lines per example budgeted),
    # NOT by the donut's image height -- a content-length mismatch here is what
    # caused the box to overflow into the callout below in the first draft.
    box_x = 0.85*inch + 2.6*inch + 0.3*inch
    box_w = PAGE_W - 0.85*inch - box_x
    per_item = 11 + 2*10.6 + 4  # name line + up to 2 wrapped lines + spacing
    box_h = 16 + len(examples) * per_item + 14  # header + items + bottom pad
    donut_y = max(1.55*inch, 0.85*inch + 0.85*inch)  # leave room for callout box below
    top_y = donut_y + box_h - 0.2*inch  # top of the box/donut row

    img = ImageReader(chart_path)
    iw, ih = img.getSize()
    disp_w = 2.6*inch
    disp_h = disp_w * ih / iw
    # vertically center the donut within the examples-box's height
    donut_draw_y = donut_y - 0.2*inch + (box_h - disp_h) / 2
    c.drawImage(img, 0.85*inch, donut_draw_y, width=disp_w, height=disp_h, mask="auto")

    c.setFillColor(LIGHT_BG)
    c.roundRect(box_x, donut_y - 0.2*inch, box_w, box_h, 6, fill=1, stroke=0)
    ey = donut_y - 0.2*inch + box_h - 0.28*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 8.6)
    c.drawString(box_x + 0.16*inch, ey, "NOTABLE LATERAL MOVES")
    ey -= 16
    for name, move in examples:
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8.8)
        c.drawString(box_x + 0.16*inch, ey, name)
        ey -= 11
        ey = wrap_text(c, move, box_x + 0.16*inch, ey, box_w - 0.32*inch, "Helvetica", 8.3, 10.6, SLATE)
        ey -= 4

    box_y = 0.85*inch
    box_h2 = 0.62*inch
    c.setFillColor(LIGHT_BG)
    c.roundRect(0.85*inch, box_y, PAGE_W - 1.7*inch, box_h2, 5, fill=1, stroke=0)
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 8.3)
    c.drawString(1.0*inch, box_y + box_h2 - 16, "FOR SEARCH LEADERS")
    wrap_text(c, callout, 1.0*inch, box_y + box_h2 - 30, PAGE_W - 2.0*inch, "Helvetica", 9.3, 12.5, NAVY)


def make_pdf(out_path):
    cover_path = OUT_DIR + "cover-prior-position.png"
    make_cover(
        cover_path,
        ["The Path Before", "the Deanship"],
        ["Where business-school deans come from when they come",
         "from elsewhere — and why the in-house interim rarely wins."],
        [("796", "dean appointments"), ("150", "Carnegie R1 universities"), ("1990-2025", "36 years")],
        "August 2026  ·  BatonIndex Research",
    )

    c_pop = chart_population()
    c1 = chart_prior_position()
    c_spot = chart_spotlight_donut()
    c2 = chart_era_trend_grouped()
    c3 = chart_interim_outcomes()
    c4 = chart_tenure()
    c_ind = chart_industry_trend()
    c5 = chart_gender()

    c = canvas.Canvas(out_path, pagesize=letter)
    c.setTitle(f"{TITLE}, A BatonIndex Research Brief")
    c.setAuthor("BatonIndex")
    c.setSubject("Leadership succession intelligence")

    # Page 1: cover
    cover_img = ImageReader(cover_path)
    c.drawImage(cover_img, 0, 0, width=PAGE_W, height=PAGE_H)
    c.showPage()

    # Page 2: intro + seven findings + population infographic
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
    intro = ("When a business school hires its next dean, the intuitive story is a first-time academic climbing "
             "out of the faculty ranks. BatonIndex's census of 796 dean appointments at all 150 Carnegie R1 "
             "universities from 1990 to 2025 tells a more specific story: when a school goes outside, the two "
             "leading channels are an associate or vice dean stepping up, or a sitting dean recruited away from "
             "another business school — and when it is a lateral dean move, it is almost always same-discipline, "
             "not a crossover from a different kind of school.")
    y = wrap_text(c, intro, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.5, 15, NAVY)
    y -= 10

    img = ImageReader(c_pop)
    iw, ih = img.getSize()
    disp_w = PAGE_W - 1.7*inch
    disp_h = disp_w * ih / iw
    c.drawImage(img, 0.85*inch, y - disp_h, width=disp_w, height=disp_h, mask="auto")
    y -= disp_h + 14

    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12.5)
    c.drawString(0.85*inch, y, "Seven findings")
    y -= 18
    findings_short = [
        "The two default channels: an associate/vice dean promotion (26.7% of external hires) and a sitting dean recruited from another business school (25.0%) together account for over half of every outside hire.",
        "When it is a lateral dean move, it is almost always same-discipline: 78.2% of dean-elsewhere hires come from another business school, only 21.8% from a different kind of school — roughly the reverse of the popular assumption.",
        "The lateral-dean channel is growing, and all of the growth is same-type: from 27.4% of external hires in the 1990s to 39.2% in the 2020s, driven entirely by same-business-school moves.",
        "The interim is the underdog for the permanent job. 30.5% of all hires start as interim, but only 17.2% convert to permanent in place, while 60.8% are succeeded by an externally recruited sitting or former dean.",
        "Recruits from outside the discipline get the shortest tenure: 6.0 years for a dean hired from a different kind of school, versus 7.4 years for a faculty-only hire with no prior admin title.",
        "The industry channel is shrinking as the lateral-dean channel grows: from 29.0% of external hires in the 1990s to 13.5% in the 2020s.",
        "The lateral-dean channel favors women, if anything: 28.2% of dean-to-dean lateral hires are women, above the 20.1% female share of all hires.",
    ]
    bullet_list(c, findings_short, 0.85*inch, y, PAGE_W - 1.7*inch, font_size=9.6, leading=12.6)
    c.showPage()

    # Finding 1
    finding_page(
        c, "1 OF 7", "The two default channels",
        ["The two default channels for an outside hire"],
        [("Search committees often frame an external search as a chance to bring in fresh, first-time academic "
          "leadership. The record shows two dominant channels instead: 26.7% of true-external hires (a different "
          "university) are an associate or vice dean promoted up, and 25.0% are a sitting dean recruited away from "
          "another business school. Combined with department chairs (4.7%), 56.4% of external hires already carry "
          "a senior academic-administration title of some kind before they walk in the door."),
         ("Faculty-only hires with no administrative title on file (16.3%) and industry executives (14.0%) make up "
          "most of the rest. A genuinely fresh, first-time academic-leadership debut is a real but minority path "
          "into the outside-hire pool.")],
        c1, "Prior position of true-external dean hires (different university); R1 census, 1990-2025.",
        "Benchmark a candidate's market value against sitting deans and associate/vice deans, not against the "
        "faculty ranks generally. Those two channels alone cover more than half the realistic outside-hire field.",
        2,
    )
    c.showPage()

    # Finding 2 (spotlight)
    spotlight_page(
        c, "2 OF 7", "The lateral-dean spotlight",
        ["When it's a lateral dean move, it's almost", "always the same discipline"],
        [("Of the 110 true-external hires who were already a dean somewhere else, 78.2% came from another business "
          "school and only 21.8% came from a different kind of school entirely — roughly the reverse of what "
          "the popular \"deans are interchangeable across fields\" assumption would predict. A business-school "
          "search recruiting a sitting dean is, more than three times out of four, poaching from a peer business "
          "school, not making a cross-disciplinary bet."),
         ("The clearest single illustration is one person's career: Edward “Ted” Snyder moved from "
          "associate dean at Michigan Ross to the deanship at UVA Darden (1998), then Chicago Booth (2001), then "
          "Yale SOM (2011) — three consecutive business-school deanships in a row.")],
        c_spot,
        [
            ("Edward “Ted” Snyder", "Michigan Ross (assoc. dean) → Darden (1998) → Chicago Booth (2001) → Yale SOM (2011)"),
            ("George G. Daly", "NYU Stern → Georgetown (2005)"),
            ("Yash Gupta", "USC Marshall → Johns Hopkins Carey (2008)"),
            ("Alexander Triantis", "Maryland Smith → Johns Hopkins Carey (2019)"),
            ("Erika H. James", "Emory Goizueta → Wharton, UPenn (2020)"),
        ],
        3,
        "When a competitor school's dean is in play, assume the most likely bidder pool is other business schools, "
        "not adjacent disciplines. Frame your client's opportunity against that specific competitive set.",
    )
    c.showPage()

    # Finding 3 (era trend)
    finding_page(
        c, "3 OF 7", "A widening, concentrated pattern",
        ["The lateral-dean channel is growing — and all", "of the growth is same-type"],
        [("The share of external hires who were already a dean elsewhere climbed from 27.4% in the 1990s to 39.2% "
          "in the 2020s. Breaking that trend out by same-type vs. different-type shows the growth is not spread "
          "evenly: same-business-school moves grew from 10 to 38 hires per era at their 2010s peak (23 in the "
          "2020s), while different-kind-of-school moves stayed flat at 4-7 hires every era on file."),
         ("In other words, the business-school dean market has not become more open to cross-disciplinary hires "
          "over time — it has become a more active, more self-contained market for sitting business-school "
          "deans specifically.")],
        c2, "Share of true-external hires by dean-elsewhere type, by era; R1 census, 1990-2025.",
        "Plan searches assuming the strongest reference set is other sitting business-school deans, not "
        "administrators from other kinds of schools. That specific pool is both the majority and the growth "
        "engine of the lateral-dean market.",
        4,
    )
    c.showPage()

    # Finding 4 (interim)
    finding_page(
        c, "4 OF 7", "Interim stewardship",
        ["The interim is the underdog for the job"],
        [("Interim appointments are common — 30.5% of all 796 hires start that way — but the interim seat "
          "is not a quiet path to the permanent title. Tracking each interim appointment to its resolved outcome "
          "(232 of 243 interim spells with a successor on file), only 17.2% convert to permanent in place. A clear "
          "majority, 60.8%, are instead succeeded by an externally recruited sitting or former dean."),
         ("The pattern holds at marquee schools: Chicago Booth's interim gave way to Stanford GSB's Madhav Rajan "
          "(2017); Northwestern Kellogg's interim to NYU Stern's Sally Blount (2010); MIT Sloan's interim to "
          "Wharton's David Schmittlein (2007). The interim more often keeps the seat warm for an outside dean than "
          "for themselves.")],
        c3, "Outcome of interim dean appointments, resolved cases only; R1 census, 1990-2025.",
        "Don't assume the interim is a lock, or discourage them from competing formally. Run the external search "
        "in earnest even with a capable interim in place; the data says the board usually does exactly that.",
        5,
    )
    c.showPage()

    # Finding 5 (tenure) -- REVISED conclusion
    finding_page(
        c, "5 OF 7", "Tenure outcomes",
        ["Recruits from outside the discipline get the", "shortest tenure"],
        [("Tenure length varies by prior-position type, and the shortest average tenure belongs to deans recruited "
          "from a different kind of school entirely: 6.0 years, versus 6.3 years for both a same-business-school "
          "lateral hire and an associate/vice-dean promotion, 6.8 for a department chair, and 7.4 for a "
          "faculty-only hire with no prior administrative title."),
         ("The gradient is real but modest — a roughly 1.4-year spread from shortest to longest, not a "
          "dramatic gap. A cross-disciplinary dean hire is the closest thing to a wildcard pick here, both least "
          "common and shortest-lived, though not by a wide margin.")],
        c4, "Average tenure length by prior-position type, true-external hires; R1 census, 1990-2025.",
        "A same-discipline lateral hire or an associate-dean promotion is not a durability risk relative to a "
        "faculty-only hire — tenure lengths are close across most of the outside-hire pool. Save the caution "
        "for a genuine cross-disciplinary crossover.",
        6,
    )
    c.showPage()

    # Finding 6 (industry)
    finding_page(
        c, "6 OF 7", "The shrinking alternative",
        ["The industry channel is shrinking as the", "lateral-dean channel grows"],
        [("The rise of the lateral-dean hire has a mirror image: the industry-to-deanship channel is fading. Hires "
          "with a direct industry or executive background made up 29.0% of external hires in the 1990s; by the "
          "2020s that share had fallen to 13.5%, a steady decline every decade."),
         ("The channel has not disappeared, and it still reaches into unexpected places: MIT Sloan's 2025 hire "
          "came directly from Apple University, Apple's internal corporate learning arm. But the market is "
          "consolidating around academic administrators who have already run a school, not executives making a "
          "first crossover into higher education.")],
        c_ind, "Share of true-external hires with an industry/executive background, by era; R1 census, 1990-2025.",
        "Don't count on the executive-crossover pitch working as well as it once did. If an industry candidate "
        "belongs on the slate, frame their case explicitly against a market that increasingly defaults to sitting "
        "academic deans.",
        7,
    )
    c.showPage()

    # Finding 7 (gender)
    finding_page(
        c, "7 OF 7", "The gender read",
        ["The lateral-dean channel favors women,", "if anything"],
        [("BatonIndex's companion brief on gendered pathways found sharp, discipline-specific gaps in who reaches "
          "the deanship, worst in operations management. The lateral dean-to-dean channel shows the opposite "
          "pattern: women are 28.2% of dean-to-dean lateral hires, above their 22.4% share of external hires "
          "overall and their 20.1% share of all hires, internal and external combined."),
         ("Once a woman has reached a deanship, in other words, the data shows no evidence she is passed over for "
          "the next one — if anything, she is somewhat more likely to be recruited onward than her male peers. "
          "The constraint sits earlier in the pipeline, in who gets the first deanship.")],
        c5, "Female share of hires by pool; R1 census, 1990-2025. See \"Gendered Pathways in Academic Leadership.\"",
        "If the goal is a more representative slate, invest upstream, in the associate-dean and department-chair "
        "feeder, not in second-guessing the lateral-dean market — that market is not where this gap lives.",
        8,
    )
    c.showPage()

    # Playbook
    header(c, 9)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, "THE PLAYBOOK")
    y -= 24
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(0.85*inch, y, "What this means for your next search")
    y -= 24
    y = wrap_text(c, "Seven evidence-based moves for committees and recruiters working the business-school dean market:",
                  0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.5, 14.5, NAVY)
    y -= 8
    playbook = [
        "Default your benchmark to two pools: sitting deans and associate/vice deans. Together they're the majority of the realistic outside-hire field.",
        "When a lateral dean move is in play, assume same-discipline. Peer business schools are the leading bidder pool, more than 3-to-1 over cross-disciplinary moves.",
        "Expect the lateral market to keep concentrating. Same-type moves are the entire growth story since 1990; cross-type moves haven't budged.",
        "Run the outside search even with a strong interim. Only 17% of interims convert to permanent; a credible outside sitting-dean candidate beats the interim more often than not.",
        "Don't over-discount a cross-disciplinary or faculty-only hire on tenure grounds. The tenure spread across most of the pool is under a year and a half.",
        "Take industry candidates seriously, but frame the pitch. The channel is real but has shrunk by more than half since the 1990s as the market defaults to sitting academic deans.",
        "Put the gender work upstream. The lateral dean-to-dean channel itself favors women; invest in the associate-dean and department-chair feeder instead.",
    ]
    bullet_list(c, playbook, 0.85*inch, y, PAGE_W - 1.7*inch, font_size=9.8, leading=13.4)
    c.showPage()

    # Methodology
    header(c, 10)
    y = PAGE_H - 1.05*inch
    c.setFillColor(MAROON)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.85*inch, y, "METHODOLOGY & ABOUT")
    y -= 24
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(0.85*inch, y, "About this brief")
    y -= 20
    method = ("This brief draws on the same BatonIndex census used in “The Discipline Behind the Dean” and "
              "“Gendered Pathways in Academic Leadership”: a hand-coded, web-verified record of 796 dean "
              "appointments at all 150 Carnegie R1 universities, 1990-2025. Each appointment is classified by "
              "origin (internal, external, or a same-university move to a different school), prior title and "
              "institution, and appointment type (permanent or interim).")
    y = wrap_text(c, method, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 10
    method2 = ("Prior-position categories were assigned from each dean's recorded prior title, checked against both "
               "the title text and the prior institution's name: a title containing “dean” that is not "
               "qualified by associate/assistant/vice/deputy/interim counts as a head-dean role, then split "
               "same-type vs. different-type by matching the prior institution's name (not just the title) against "
               "a business-school-name pattern — catching cases like “Dean, NYU Stern School of "
               "Business” where the word “business” never appears in the person's title itself.")
    y = wrap_text(c, method2, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 10
    method3 = ("Interim outcomes were determined by matching each interim appointment to the next appointment on "
               "file at the same school: a same-person match with no further interim tag counts as “converted "
               "to permanent”; a different, externally sourced successor counts as “succeeded by an "
               "external hire.” Interim spells with no successor yet on file are excluded from Finding 4's "
               "resolved-outcome figures. Appointments were assembled from primary sources, university "
               "announcements, official biographies and CVs, and contemporaneous coverage, and passed a full "
               "web-verification pass in 2026.")
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
    cta = ("Want the underlying benchmarks for a specific school, discipline, or region, or a co-branded edition "
           "of this brief for a client? Reach the BatonIndex team through the Contact link in the app.")
    y = wrap_text(c, cta, 0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica", 10.2, 14, NAVY)
    y -= 20
    c.setFont("Helvetica-Oblique", 8.6)
    c.setFillColor(SLATE)
    wrap_text(c, "Suggested citation: BatonIndex (2026). The Path Before the Deanship: A Research Brief. Based on "
                 "the BatonIndex R1 Business Dean Census, 1990-2025.",
              0.85*inch, y, PAGE_W - 1.7*inch, "Helvetica-Oblique", 8.6, 12, SLATE)
    c.showPage()

    c.save()
    print("saved", out_path)


if __name__ == "__main__":
    make_pdf(OUT_DIR + "baton-prior-position-brief.pdf")
