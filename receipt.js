// Pulls store name, total and date out of OCR'd receipt text.
(function (root) {
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const NUM = /\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;

  function toNum(s) { return parseFloat(s.replace(/,/g, "")); }

  function normalize(line) {
    return line
      .replace(/(\d)\s*[,]\s*(\d{2})(?![\d,])/g, "$1.$2")   // "450,00" -> "450.00"
      .replace(/(\d)\s+\.\s*(\d{2})\b/g, "$1.$2")             // "450 .00" -> "450.00"
      .replace(/[₹]|\bRs\.?|\bINR\b/gi, " ");
  }

  function findTotal(lines) {
    const patterns = [
      /grand\s*total/i,
      /net\s*(amount|amt|payable|total|bill)/i,
      /(amount|amt)\s*(payable|due|paid)/i,
      /bill\s*(amount|amt|total)/i,
      /\btotal\b/i,
    ];
    const exclude = /sub\s*-?\s*total|total\s*(qty|quantity|items?|savings?|saved|discount|tax|gst|mrp)|you\s*saved|tendered|change\b/i;
    for (const p of patterns) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (!p.test(l) || exclude.test(l)) continue;
        const after = l.slice(l.search(p));
        let vals = (after.match(NUM) || []).map(toNum).filter(v => v > 0);
        if (!vals.length && lines[i + 1]) vals = (lines[i + 1].match(NUM) || []).map(toNum).filter(v => v > 0);
        if (vals.length) return vals[vals.length - 1];
      }
    }
    // Fallback: largest money-looking number (has 2 decimals)
    const money = lines.flatMap(l => (l.match(/\d{1,3}(?:,\d{2,3})*\.\d{2}\b|\d+\.\d{2}\b/g) || []).map(toNum)).filter(v => v > 0 && v < 1e7);
    return money.length ? Math.max(...money) : null;
  }

  function validDate(y, m, d, now) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    const days = (now - dt) / 864e5;
    if (days < -1 || days > 730) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function findDate(text, now = new Date()) {
    let m;
    const iso = /\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g;
    while ((m = iso.exec(text))) { const r = validDate(+m[1], +m[2], +m[3], now); if (r) return r; }
    const dmy = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})\b/g;
    while ((m = dmy.exec(text))) {
      let d = +m[1], mo = +m[2];
      if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // looks like mm/dd
      const r = validDate(+m[3], mo, d, now); if (r) return r;
    }
    const named = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]*([A-Za-z]{3,9})[\s\-\/.,']*(\d{2,4})\b/g;
    while ((m = named.exec(text))) {
      const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
      if (mo) { const r = validDate(+m[3], mo, +m[1], now); if (r) return r; }
    }
    const named2 = /\b([A-Za-z]{3,9})[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?[\s,\-]+(\d{4})\b/g;
    while ((m = named2.exec(text))) {
      const mo = MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)];
      if (mo) { const r = validDate(+m[3], mo, +m[2], now); if (r) return r; }
    }
    return null;
  }

  function findStore(lines) {
    const skip = /invoice|receipt|\bgst|gstin|\btax\b|\bbill\b|phone|\bph\b|tel\b|mob|www|\.com|@|address|\broad\b|\brd\b|street|\bst\.|\bcin\b|fssai|date|time|cash|counter|cashier|welcome|thank|order|table|token|duplicate|original|copy|pvt|ltd|limited|floor|nagar|layout|cross|main/i;
    for (const raw of lines.slice(0, 8)) {
      const l = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)&'.]+$/g, "").trim();
      const letters = (l.match(/[A-Za-z]/g) || []).length;
      const digits = (l.match(/\d/g) || []).length;
      if (letters < 3 || digits > letters / 3 || l.length > 40 || skip.test(l)) continue;
      return l === l.toUpperCase()
        ? l.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
        : l;
    }
    return null;
  }

  function parseReceipt(text, now) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const norm = lines.map(normalize);
    const total = findTotal(norm);
    return {
      store: findStore(lines),
      amount: total != null ? Math.round(total * 100) / 100 : null,
      date: findDate(text, now),
    };
  }

  root.parseReceipt = parseReceipt;
  if (typeof module !== "undefined") module.exports = { parseReceipt };
})(typeof window !== "undefined" ? window : globalThis);
