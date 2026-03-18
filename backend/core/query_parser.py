"""Search query parsing — local (jieba + DB lookup) and cloud (OpenAI) modes."""
import re
import json
import jieba
from pypinyin import lazy_pinyin
from db.database import get_connection

_location_cache: set[str] | None = None
_location_lower_map: dict[str, str] = {}


def _get_location_set() -> set[str]:
    global _location_cache
    if _location_cache is None:
        refresh_location_cache()
    return _location_cache


def refresh_location_cache():
    global _location_cache, _location_lower_map
    try:
        conn = get_connection()
        rows = conn.execute("SELECT DISTINCT location_name FROM images WHERE location_name IS NOT NULL").fetchall()
        _location_cache = {row[0] for row in rows}
        _location_lower_map = {row[0].lower(): row[0] for row in rows}
    except Exception:
        _location_cache = set()
        _location_lower_map = {}


def _to_pinyin(text: str) -> str:
    """Convert Chinese text to pinyin, capitalize each word."""
    return "".join(w.capitalize() for w in lazy_pinyin(text))


def _extract_date(query: str) -> tuple[str, str | None, str | None]:
    """Extract date from query. Returns (cleaned, date_from, date_to)."""
    from datetime import date, timedelta
    now = date.today()
    s = query

    # Relative dates
    year_kw = {"今年": now.year, "去年": now.year - 1, "前年": now.year - 2}
    season_kw = {"春天": ("03", "05"), "夏天": ("06", "08"), "秋天": ("09", "11"), "冬天": ("12", "02")}
    month_kw = {"上个月": (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m"),
                "这个月": now.strftime("%Y-%m")}

    # Month keywords (standalone)
    for kw, ym in month_kw.items():
        if kw in s:
            return s.replace(kw, "").strip(), ym, ym

    # Year + season combo
    matched_year = None
    for kw, y in year_kw.items():
        if kw in s:
            matched_year = y
            s = s.replace(kw, "").strip()
            break
    for kw, (m1, m2) in season_kw.items():
        if kw in s:
            y = matched_year or now.year
            s = s.replace(kw, "").strip()
            df = f"{y}-{m1}"
            dt = f"{y+1 if m2 < m1 else y}-{m2}"
            return s, df, dt
    if matched_year:
        return s, f"{matched_year}-01", f"{matched_year}-12"

    # YYYY年M月
    m = re.search(r'(\d{4})\s*[年/\-]\s*(\d{1,2})\s*[月]?', s)
    if m:
        y, mo = m.group(1), m.group(2).zfill(2)
        s = (s[:m.start()] + s[m.end():]).strip()
        return s, f"{y}-{mo}", f"{y}-{mo}"
    # YYYY年
    m = re.search(r'(\d{4})\s*年?', s)
    if m and 1900 <= int(m.group(1)) <= 2099:
        y = m.group(1)
        s = (s[:m.start()] + s[m.end():]).strip()
        return s, f"{y}-01", f"{y}-12"
    return s, None, None


STOP_WORDS = {"的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这"}


def parse_local(query: str) -> dict:
    """Parse query using jieba + DB location lookup."""
    remaining, date_from, date_to = _extract_date(query)
    locations = _get_location_set()

    words = [w for w in jieba.cut(remaining) if w.strip() and w not in STOP_WORDS]

    matched_locs = []
    visual_words = []
    for w in words:
        # Try direct match first, then pinyin
        py = _to_pinyin(w).lower()
        if any(w in loc or py in loc.lower() for loc in locations):
            matched_locs.append(w if any(w in loc for loc in locations) else py)
        else:
            visual_words.append(w)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "locations": matched_locs,
        "visual": "".join(visual_words),
        "original": query,
    }


def parse_cloud(query: str, api_key: str, base_url: str | None = None, model: str = "gpt-4o-mini") -> dict:
    """Parse query using OpenAI-compatible API — full query sent to AI."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
        from datetime import date
        today = date.today().strftime("%Y-%m-%d")
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": f'Today is {today}. You parse photo search queries into structured filters. Return ONLY JSON: {{"date_from": "YYYY-MM" or null, "date_to": "YYYY-MM" or null, "locations": ["地名 in Pinyin, e.g. Beijing, Guangdong"], "visual": "remaining text"}}. Resolve relative dates to absolute YYYY-MM. locations=place names converted to Pinyin (capitalize first letter). visual=the original query text with dates and locations removed, do NOT rephrase or summarize. Omit fields that are absent: null/[]/"".'},
                {"role": "user", "content": "去年北京的早点"},
                {"role": "assistant", "content": f'{{"date_from": "{date.today().year - 1}-01", "date_to": "{date.today().year - 1}-12", "locations": ["Beijing"], "visual": "早点"}}'},
                {"role": "user", "content": query},
            ],
            max_tokens=80,
        )
        data = json.loads(resp.choices[0].message.content)
        return {
            "date_from": data.get("date_from"),
            "date_to": data.get("date_to"),
            "locations": [_to_pinyin(l) if re.search(r'[\u4e00-\u9fff]', l) else l for l in data.get("locations", [])],
            "visual": data.get("visual") or "",
            "original": query,
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        return parse_local(query)
