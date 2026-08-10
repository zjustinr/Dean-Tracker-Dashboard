"""Shared cover-image template for BatonIndex research briefs -- matches the
visual convention of every cover-*.png in public/insights/ (1275x1650 @
150dpi letter-size page: maroon header band, wordmark, title, subtitle,
three-stat row, date footer). Imported by each brief's gen_*.py script;
kept as a small shared module (rather than duplicated per-script) since it
has no brief-specific logic, unlike the layout/chart code in each brief
script, which IS deliberately duplicated (see gen-scout-insights.mjs's own
comment on this) so each brief generator stays runnable standalone."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1275, 1650
MAROON = (163, 31, 52)       # #A31F34
NAVY = (11, 31, 58)          # #0B1F3A
SLATE = (90, 104, 122)
BG = (250, 250, 252)         # near-white

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
F_BOLD = FONT_DIR + "DejaVuSans-Bold.ttf"
F_REG = FONT_DIR + "DejaVuSans.ttf"

def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def make_cover(out_path, title_lines, subtitle_lines, stats, date_label):
    """stats: list of up to 3 (number_str, label_str) tuples."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    header_h = 455
    d.rectangle([0, 0, W, header_h], fill=MAROON)
    d.rectangle([0, header_h, W, header_h + 8], fill=NAVY)
    d.rectangle([0, H - 8, W, H], fill=MAROON)

    # Logo mark: circle outline + "b" glyph + flag, mimicking the app's brand mark
    cx, cy, r = 228, 248, 88
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 80), width=2)
    d.rectangle([cx - 58, cy - 40, cx - 30, cy + 55], fill="white")
    fb = font(F_BOLD, 92)
    d.text((cx - 20, cy - 62), "b", font=fb, fill="white")
    d.rectangle([cx + 38, cy - 62, cx + 66, cy + 55], fill="white")
    d.rectangle([cx + 38, cy - 62, cx + 100, cy - 34], fill="white")

    d.text((343, 190), "BatonIndex", font=font(F_BOLD, 54), fill="white")
    d.text((343, 258), "Leadership Succession Intelligence", font=font(F_REG, 26), fill=(240, 220, 224))
    d.text((135, 390), "A RESEARCH BRIEF FOR SEARCH PROFESSIONALS", font=font(F_BOLD, 22), fill="white")

    f_title = font(F_BOLD, 62)
    y = 540
    for line in title_lines:
        d.text((135, y), line, font=f_title, fill=NAVY)
        y += 76

    y += 18
    d.rectangle([135, y, 360, y + 6], fill=MAROON)
    y += 45

    f_sub = font(F_REG, 30)
    for line in subtitle_lines:
        d.text((135, y), line, font=f_sub, fill=SLATE)
        y += 42

    stats_y = 1225
    f_stat_num = font(F_BOLD, 46)
    f_stat_label = font(F_REG, 22)
    xs = [135, 468, 800]
    for (num, label), sx in zip(stats, xs):
        d.text((sx, stats_y), num, font=f_stat_num, fill=MAROON)
        d.text((sx, stats_y + 62), label, font=f_stat_label, fill=SLATE)

    d.line([135, stats_y + 115, 1140, stats_y + 115], fill=(220, 220, 226), width=2)

    f_footer = font(F_REG, 24)
    d.text((135, 1565), date_label, font=f_footer, fill=SLATE)
    footer2 = "Prepared for leadership search professionals"
    bbox = d.textbbox((0, 0), footer2, font=f_footer)
    d.text((1140 - (bbox[2] - bbox[0]), 1565), footer2, font=f_footer, fill=SLATE)

    img.save(out_path)
    print("saved", out_path)
