/* =====================================================================
   FAN'APA — cœur métier : formats, mentions légales, totaux, PDF
   (partagé entre l'appli et les tests ; aucune dépendance au DOM)
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- Formats ---------- */
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const NB = ' ';

  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseISO(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  function addDays(iso, n) {
    const d = parseISO(iso); if (!d) return iso;
    d.setDate(d.getDate() + Number(n || 0));
    return todayISO(d);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }
  function fmtDateLong(iso) {
    const d = parseISO(iso); if (!d) return '';
    return d.getDate() + (d.getDate() === 1 ? 'er' : '') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtMoney(cents, opts) {
    const sep = (opts && opts.sep) || NB;
    const minus = (opts && opts.minus) || '−';
    let c = Math.round(Number(cents) || 0);
    const neg = c < 0; c = Math.abs(c);
    const e = Math.floor(c / 100), d = pad2(c % 100);
    const s = String(e).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return (neg ? minus : '') + s + ',' + d + sep + '€';
  }
  function fmtQty(q) {
    q = Number(q) || 0;
    const r = Math.round(q * 100) / 100;
    return String(r).replace('.', ',');
  }
  function eurosToCents(v) {
    if (typeof v === 'number') return Math.round(v * 100);
    const s = String(v || '').replace(/\s| | |€/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) : 0;
  }
  function centsToInput(c) {
    c = Math.round(Number(c) || 0);
    if (!c) return '';
    return (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
  }
  function upper(s) { return String(s || '').trim().toLocaleUpperCase('fr-FR'); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function fmtSiret(s) {
    const d = digits(s);
    if (d.length === 14) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 9) + ' ' + d.slice(9);
    if (d.length === 9) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
    return String(s || '').trim();
  }
  function fmtIban(s) {
    return String(s || '').replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
  }
  function fmtPhone(s) {
    const d = digits(s);
    if (d.length === 10 && d[0] === '0') return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    return String(s || '').trim();
  }

  /* ---------- Contrôles ---------- */
  function luhn(num) {
    const d = digits(num); if (!d) return false;
    let sum = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function validSiret(s) {
    const d = digits(s);
    if (d.length !== 14) return false;
    if (d.startsWith('356000000')) { // La Poste
      return d.split('').reduce((a, b) => a + +b, 0) % 5 === 0;
    }
    return luhn(d);
  }
  function validSiren(s) { const d = digits(s); return d.length === 9 && luhn(d); }
  function validIban(s) {
    const v = String(s || '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
    const r = v.slice(4) + v.slice(0, 4);
    let mod = 0;
    for (const ch of r) {
      const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
      for (const c of code) mod = (mod * 10 + +c) % 97;
    }
    return mod === 1;
  }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }

  /* ---------- Libellés métier ---------- */
  const METHODS = [
    { id: 'virement', label: 'Virement', long: 'virement bancaire' },
    { id: 'cheque', label: 'Chèque', long: 'chèque' },
    { id: 'especes', label: 'Espèces', long: 'espèces' },
    { id: 'cb', label: 'Carte bancaire', long: 'carte bancaire' },
    { id: 'ancv', label: 'Coupon Sport ANCV', long: 'Coupon Sport ANCV' }
  ];
  function methodLong(id) { const m = METHODS.find(x => x.id === id); return m ? m.long : id; }
  function methodLabel(id) { const m = METHODS.find(x => x.id === id); return m ? m.label : id; }
  function joinFr(arr) {
    arr = arr.filter(Boolean);
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' ou ' + arr[arr.length - 1];
  }
  function methodsText(ids) { return joinFr((ids || []).map(methodLong)); }

  const DEFAULT_PENALTY = '3 fois le taux d’intérêt légal';

  function vatMention(vat) {
    if (!vat) return '';
    if (vat.mode === 'franchise') return 'TVA non applicable, art. 293 B du CGI';
    if (vat.mode === 'exempt') return vat.exemptText || 'Exonération de TVA';
    if (vat.mode === 'subject' && vat.debits) return 'Option pour le paiement de la TVA d’après les débits';
    return '';
  }

  function computeTotals(lines, vat, sign) {
    sign = sign || 1;
    let ht = 0;
    (lines || []).forEach(l => { ht += Math.round((Number(l.qty) || 0) * (Number(l.unit) || 0)); });
    let tva = 0;
    if (vat && vat.mode === 'subject') tva = Math.round(ht * (Number(vat.rate) || 0) / 100);
    return { ht: sign * ht, tva: sign * tva, ttc: sign * (ht + tva) };
  }
  function lineTotal(l) { return Math.round((Number(l.qty) || 0) * (Number(l.unit) || 0)); }

  function sellerName(seller) {
    const n = [String(seller.firstName || '').trim(), upper(seller.lastName)].filter(Boolean).join(' ');
    return n ? n + ' EI' : '';
  }
  function sellerLines(seller) {
    const a = seller.address || {};
    const out = [];
    if (a.line1) out.push(a.line1);
    if (a.line2) out.push(a.line2);
    const cz = [a.zip, a.city].filter(Boolean).join(' ');
    if (cz) out.push(cz);
    return out;
  }
  function clientAddressLines(c) {
    const a = (c && c.address) || {};
    const out = [];
    if (a.line1) out.push(a.line1);
    if (a.line2) out.push(a.line2);
    const cz = [a.zip, a.city].filter(Boolean).join(' ');
    if (cz) out.push(cz);
    return out;
  }
  function serviceText(inv, compact) {
    const s = inv.service || {};
    if (s.mode === 'period' && s.from && s.to) {
      if (compact && s.from.slice(0, 4) === s.to.slice(0, 4)) {
        return 'Du ' + fmtDate(s.from).slice(0, 5) + ' au ' + fmtDate(s.to);
      }
      return 'Du ' + fmtDate(s.from) + ' au ' + fmtDate(s.to);
    }
    if (s.date) return (compact ? '' : 'Le ') + fmtDate(s.date);
    return compact ? fmtDate(inv.issueDate) : 'Le ' + fmtDate(inv.issueDate);
  }
  function dueShort(inv) {
    if (inv.term === 'reception') return 'À réception';
    return fmtDate(inv.dueDate);
  }
  function dueSentence(inv) {
    if (inv.term === 'reception') return 'à réception de la facture';
    if (inv.term === '15' || inv.term === '30' || inv.term === '45') return 'le ' + fmtDate(inv.dueDate) + ' au plus tard (' + inv.term + ' jours à compter de la date de facture)';
    return 'le ' + fmtDate(inv.dueDate) + ' au plus tard';
  }
  function proLateText(terms) {
    const rate = (terms && terms.penaltyRate) || DEFAULT_PENALTY;
    return 'En cas de retard de paiement, des pénalités calculées à ' + rate +
      ' sont exigibles dès le lendemain de la date d’échéance, ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40' + NB +
      '€ (art. L441-10 et D441-5 du Code de commerce). Pas d’escompte pour paiement anticipé.';
  }
  function insuranceText(ins) {
    if (!ins || !ins.insurer) return '';
    let t = 'Assurance responsabilité civile professionnelle : ' + ins.insurer;
    if (ins.policy) t += ', contrat n°' + NB + ins.policy;
    if (ins.coverage) t += ' – couverture : ' + ins.coverage;
    return t;
  }

  /* ---------- Numérotation ---------- */
  function cleanPrefix(p, fallback) {
    const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return s || fallback;
  }
  function seriesKey(kind, numbering, year) {
    const n = numbering || {};
    const prefix = kind === 'credit' ? cleanPrefix(n.creditPrefix, 'AV') : cleanPrefix(n.prefix, 'FA');
    return n.yearly === false ? prefix : prefix + '-' + year;
  }
  function formatNumber(series, seq, numbering) {
    const padN = (numbering && numbering.yearly === false) ? 4 : 3;
    return series + '-' + String(seq).padStart(padN, '0');
  }
  function nextSeq(invoices, kind, numbering, year) {
    const series = seriesKey(kind, numbering, year);
    let max = 0;
    (invoices || []).forEach(i => { if (i.series === series && i.seq > max) max = i.seq; });
    const n = numbering || {};
    if (kind !== 'credit' && n.start && (n.yearly === false || Number(n.startYear) === Number(year))) {
      max = Math.max(max, Number(n.start) - 1);
    }
    return { series, seq: max + 1, number: formatNumber(series, max + 1, numbering) };
  }

  /* ---------- Texte des mails ---------- */
  const DEFAULT_SUBJECT = 'Facture {numero} – {structure}';
  const DEFAULT_BODY = 'Bonjour {client},\n\nVeuillez trouver ci-joint la facture n° {numero} du {date}, d’un montant de {montant}.\n\nRèglement attendu {echeance}. {reglement}\n\nJe reste à votre disposition pour toute question.\n\nBelle journée,\n\n{signature}';
  function mailFields(inv, settings) {
    const s = inv.seller || {};
    const methods = inv.methods || [];
    let reglement = '';
    if (methods.length) {
      reglement = 'Vous pouvez régler par ' + methodsText(methods);
      if (methods.includes('virement') && s.iban) reglement += ' (IBAN : ' + fmtIban(s.iban) + ')';
      reglement += '.';
    }
    const sig = [
      [String(s.firstName || '').trim(), upper(s.lastName)].filter(Boolean).join(' '),
      [s.tradeName, s.tagline].filter(Boolean).join(' – '),
      fmtPhone(s.phone)
    ].filter(Boolean).join('\n');
    const c = inv.client || {};
    const isCredit = inv.kind === 'credit';
    return {
      numero: inv.number || '',
      montant: fmtMoney(Math.abs(inv.totals ? inv.totals.ttc : 0), { sep: ' ' }),
      date: fmtDate(inv.issueDate),
      echeance: isCredit ? '' : (inv.term === 'reception' ? 'à réception' : 'au plus tard le ' + fmtDate(inv.dueDate)),
      client: c.type === 'pro' ? (c.contact || c.name || '') : (c.name || ''),
      structure: s.tradeName || sellerName(s),
      prenom: String(s.firstName || '').trim(),
      nom: upper(s.lastName),
      telephone: fmtPhone(s.phone),
      iban: fmtIban(s.iban),
      reglement: reglement,
      signature: sig
    };
  }
  function fillTemplate(tpl, fields) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in fields ? fields[k] : m))
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function buildMail(inv, settings) {
    const em = (settings && settings.mail) || {};
    const f = mailFields(inv, settings);
    if (inv.kind === 'credit') {
      return {
        subject: 'Avoir ' + f.numero + ' – ' + f.structure,
        body: fillTemplate('Bonjour {client},\n\nVeuillez trouver ci-joint l’avoir n° {numero} du {date}, d’un montant de {montant}, relatif à la facture n° ' + ((inv.creditOf && inv.creditOf.number) || '') + '.\n\nJe reste à votre disposition pour toute question.\n\nBelle journée,\n\n{signature}', f)
      };
    }
    return {
      subject: fillTemplate(em.subject || DEFAULT_SUBJECT, f),
      body: fillTemplate(em.body || DEFAULT_BODY, f)
    };
  }

  /* ---------- Relance d'une facture impayée (vouvoiement, ton courtois) ---------- */
  function reminderLabel(n) {
    n = Math.max(1, Math.floor(Number(n) || 1));
    return n === 1 ? 'Relance' : n + 'e relance';
  }
  function buildReminderMail(inv, settings, count) {
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const f = mailFields(inv, settings);
    const c = inv.client || {};
    const due = inv.term === 'reception' ? 'payable à réception' : 'arrivée à échéance le ' + fmtDate(inv.dueDate);
    let body = 'Bonjour {client},\n\n' +
      (n === 1 ? 'Sauf erreur de ma part, la facture' : 'Je me permets de revenir vers vous : la facture') +
      ' n° {numero} du {date}, d’un montant de {montant}, ' + due + ', reste à ce jour impayée.\n\n' +
      'Pourriez-vous procéder à son règlement dès que possible ? {reglement}\n\n';
    if (c.type === 'pro' && n >= 2) {
      const rate = (inv.terms && inv.terms.penaltyRate) || DEFAULT_PENALTY;
      body += 'Pour rappel, tout retard de paiement entraîne des pénalités calculées à ' + rate +
        ' ainsi qu’une indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce).\n\n';
    }
    body += 'Si votre règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message.\n\n' +
      'Je reste à votre disposition pour toute question.\n\nBien cordialement,\n\n{signature}';
    return {
      subject: fillTemplate(reminderLabel(n) + ' : facture {numero} – {structure}', f),
      body: fillTemplate(body, f)
    };
  }

  /* =====================================================================
     PDF (jsPDF) — A4, Montserrat embarquée, PDF protégé en écriture
     ===================================================================== */
  const C = {
    navy: [11, 56, 84], ink: [24, 45, 58], muted: [96, 116, 128], soft: [140, 156, 165],
    teal: [26, 150, 160], tealDark: [18, 122, 131], green: [122, 182, 72], leaf: [67, 148, 114],
    line: [220, 231, 230], tint: [237, 246, 243], zebra: [246, 250, 249], white: [255, 255, 255],
    stamp: [52, 132, 88]
  };
  // Glyphes disponibles dans Montserrat (sous-ensemble latin)
  const OK_CHARS = /[ -~ -ÿıŒœˆ˚˜–—‘-„†-•…‰‹›€™−]/;
  function pdfClean(str) {
    let s = String(str == null ? '' : str).replace(/ /g, ' ').replace(/\t/g, ' ');
    let out = '';
    for (const ch of s) {
      if (ch === '\n' || OK_CHARS.test(ch)) { out += ch; continue; }
      const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      out += [...base].filter(c => OK_CHARS.test(c)).join('');
    }
    return out;
  }
  function randomPwd() {
    let s = '';
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(24)) : Array.from({ length: 24 }, () => Math.floor(Math.random() * 256));
    for (let i = 0; i < 24; i++) s += a[rnd[i] % a.length];
    return s;
  }

  function buildInvoicePDF(JsPDF, inv, assets, opts) {
    opts = opts || {};
    const conf = { orientation: 'p', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true };
    if (opts.protect !== false) {
      conf.encryption = { userPassword: '', ownerPassword: randomPwd(), userPermissions: ['print', 'copy'] };
    }
    const doc = new JsPDF(conf);
    const F = { R: 'MontR', S: 'MontSB', B: 'MontB' };
    doc.addFileToVFS('Montserrat-400.ttf', assets.fonts[400]); doc.addFont('Montserrat-400.ttf', F.R, 'normal');
    doc.addFileToVFS('Montserrat-600.ttf', assets.fonts[600]); doc.addFont('Montserrat-600.ttf', F.S, 'normal');
    doc.addFileToVFS('Montserrat-700.ttf', assets.fonts[700]); doc.addFont('Montserrat-700.ttf', F.B, 'normal');

    const isCredit = inv.kind === 'credit';
    const sign = isCredit ? -1 : 1;
    const seller = inv.seller || {};
    const client = inv.client || {};
    const isPro = client.type === 'pro';
    const PW = 210, PH = 297, M = 16, R = PW - M, W = PW - 2 * M;
    const BOTTOM = 268;
    const mmPerPt = 0.352778;
    const lh = (size, f) => size * mmPerPt * (f || 1.38);

    function font(k, size, color) {
      doc.setFont(F[k], 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || C.ink);
    }
    function text(str, x, y, o) {
      o = o || {};
      font(o.f || 'R', o.size || 9, o.color);
      if (o.cs) doc.setCharSpace(o.cs);
      doc.text(pdfClean(str), x, y, { align: o.align || 'left', baseline: o.baseline || 'alphabetic' });
      if (o.cs) doc.setCharSpace(0);
    }
    function wrap(str, width, k, size) {
      font(k, size);
      return doc.splitTextToSize(pdfClean(str), width);
    }
    function label(str, x, y, color) { text(upper(str), x, y, { f: 'B', size: 6.6, color: color || C.teal, cs: 0.45 }); }

    // Métadonnées en ASCII : les caractères accentués y sont mal chiffrés par jsPDF
    const ascii = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '');
    doc.setProperties({
      title: ascii((isCredit ? 'Avoir ' : 'Facture ') + (inv.number || '')),
      subject: ascii((isCredit ? 'Avoir ' : 'Facture ') + (inv.number || '') + ' - ' + (client.name || '')),
      author: ascii(seller.tradeName || sellerName(seller)),
      creator: ascii((seller.tradeName || 'FANAPA') + ' Factures'),
      keywords: ascii('facture, ' + (inv.number || ''))
    });

    /* --- Bandeau de marque --- */
    function brandBand() {
      doc.setFillColor.apply(doc, C.navy); doc.rect(0, 0, PW * 0.62, 2.6, 'F');
      doc.setFillColor.apply(doc, C.teal); doc.rect(PW * 0.62, 0, PW * 0.24, 2.6, 'F');
      doc.setFillColor.apply(doc, C.green); doc.rect(PW * 0.86, 0, PW * 0.14, 2.6, 'F');
    }
    brandBand();

    /* --- En-tête --- */
    let logoH = 0;
    if (assets.logo && assets.logo.data) {
      const lw = 46;
      logoH = lw * (assets.logo.h / assets.logo.w);
      if (logoH > 34) { logoH = 34; }
      const realW = logoH * (assets.logo.w / assets.logo.h);
      doc.addImage(assets.logo.data, assets.logo.format || 'JPEG', M - 1.5, 10, realW, logoH, 'logo', 'FAST');
    }
    text(isCredit ? 'AVOIR' : 'FACTURE', R, 22, { f: 'B', size: 23, color: C.navy, align: 'right' });
    text('N° ' + (inv.number || 'BROUILLON'), R, 30, { f: 'S', size: 11.5, color: C.tealDark, align: 'right' });
    text('Émis' + (isCredit ? '' : 'e') + ' le ' + fmtDateLong(inv.issueDate), R, 36, { size: 8.3, color: C.muted, align: 'right' });

    /* --- Parties --- */
    let y = Math.max(10 + logoH + 7, 47);
    const colL = M, colLW = 82, colR = 110, colRW = R - colR;

    // Émetteur
    const sLines = [];
    sLines.push({ t: seller.tradeName || '', f: 'B', size: 10.5, color: C.navy });
    sLines.push({ t: sellerName(seller), f: 'S', size: 8.8, color: C.ink });
    if (seller.qualification) wrap(seller.qualification, colLW, 'R', 7.8).forEach(t => sLines.push({ t, size: 7.8, color: C.muted }));
    sellerLines(seller).forEach(t => sLines.push({ t, size: 8.3, color: C.ink }));
    if (seller.siret) sLines.push({ t: 'SIRET ' + fmtSiret(seller.siret), size: 8.3, color: C.ink });
    if (inv.vat && inv.vat.mode === 'subject' && seller.vatNumber) sLines.push({ t: 'N° TVA ' + seller.vatNumber, size: 8.3, color: C.ink });
    const contact = [seller.email, fmtPhone(seller.phone)].filter(Boolean);
    contact.forEach(t => sLines.push({ t, size: 8.3, color: C.muted }));

    // Client
    const cLines = [];
    const cw = colRW - 10;
    wrap(client.name || '', cw, 'B', 10.2).forEach(t => cLines.push({ t, f: 'B', size: 10.2, color: C.navy }));
    if (isPro && client.contact) cLines.push({ t: 'À l’attention de ' + client.contact, size: 8.3, color: C.ink });
    clientAddressLines(client).forEach(t => wrap(t, cw, 'R', 8.3).forEach(u => cLines.push({ t: u, size: 8.3, color: C.ink })));
    if (isPro && client.siren) cLines.push({ t: 'SIREN ' + fmtSiret(client.siren), size: 8.3, color: C.ink });
    if (client.email) cLines.push({ t: client.email, size: 8.3, color: C.muted });

    const hOf = arr => arr.reduce((a, l) => a + lh(l.size, 1.32), 0);
    const leftH = 6 + hOf(sLines);
    const rightH = 6 + hOf(cLines);
    const blockH = Math.max(leftH, rightH) + 6;

    label(isCredit ? 'Émetteur' : 'Émetteur', colL, y + 4);
    let yy = y + 4 + 5.2;
    sLines.forEach(l => { text(l.t, colL, yy, l); yy += lh(l.size, 1.32); });

    doc.setFillColor.apply(doc, C.tint);
    doc.roundedRect(colR, y, colRW, blockH, 3, 3, 'F');
    doc.setFillColor.apply(doc, C.teal); doc.rect(colR, y + 4, 1.1, blockH - 8, 'F');
    label(isCredit ? 'Destinataire' : 'Facturé à', colR + 6, y + 6.5, C.tealDark);
    yy = y + 6.5 + 5.2;
    cLines.forEach(l => { text(l.t, colR + 6, yy, l); yy += lh(l.size, 1.32); });

    y += blockH + 7;

    /* --- Bandeau d'informations --- */
    const cells = isCredit ? [
      ['Facture d’origine', ((inv.creditOf && inv.creditOf.number) || '') + (inv.creditOf && inv.creditOf.date ? ' du ' + fmtDate(inv.creditOf.date) : '')],
      ['Date de l’avoir', fmtDate(inv.issueDate)],
      ['Opération', 'Prestation de services']
    ] : [
      ['Prestation réalisée', serviceText(inv, true)],
      ['Échéance', dueShort(inv)],
      ['Opération', 'Prestation de services']
    ];
    const stripH = 14.5;
    doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W, stripH, 2.4, 2.4, 'S');
    const cwid = W / cells.length;
    cells.forEach((c, i) => {
      const x = M + i * cwid + 4.5;
      if (i > 0) { doc.setDrawColor.apply(doc, C.line); doc.line(M + i * cwid, y + 3, M + i * cwid, y + stripH - 3); }
      text(upper(c[0]), x, y + 5.6, { f: 'B', size: 6, color: C.soft, cs: 0.35 });
      const vals = wrap(c[1], cwid - 7, 'S', 8.6);
      text(vals[0] || '', x, y + 10.8, { f: 'S', size: 8.6, color: C.navy });
    });
    y += stripH + 8;

    /* --- Tableau des prestations --- */
    const X = { d: M + 4, q: 136, u: 165, t: R - 4 };
    const descW = 136 - 12 - (M + 4);
    function tableHead() {
      doc.setFillColor.apply(doc, C.navy);
      doc.roundedRect(M, y, W, 8.2, 1.8, 1.8, 'F');
      const ty = y + 5.3;
      text('DÉSIGNATION', X.d, ty, { f: 'B', size: 6.8, color: C.white, cs: 0.4 });
      text('QTÉ', X.q, ty, { f: 'B', size: 6.8, color: C.white, align: 'right' });
      text('PRIX UNIT. HT', X.u, ty, { f: 'B', size: 6.8, color: C.white, align: 'right' });
      text('MONTANT HT', X.t, ty, { f: 'B', size: 6.8, color: C.white, align: 'right' });
      y += 8.2;
    }
    function newPage() {
      doc.addPage();
      brandBand();
      text((isCredit ? 'Avoir ' : 'Facture ') + 'N° ' + (inv.number || '') + ' (suite)', M, 12, { f: 'S', size: 8.5, color: C.muted });
      y = 18;
    }
    tableHead();
    (inv.lines || []).forEach((l, i) => {
      const dl = wrap(l.label || '', descW, 'S', 8.8);
      const det = l.detail ? wrap(l.detail, descW, 'R', 7.6) : [];
      const h = 3.6 + dl.length * lh(8.8, 1.3) + det.length * lh(7.6, 1.3) + 2.6;
      if (y + h > BOTTOM) { newPage(); tableHead(); }
      if (i % 2 === 1) { doc.setFillColor.apply(doc, C.zebra); doc.rect(M, y, W, h, 'F'); }
      let ry = y + 3.6 + 8.8 * mmPerPt * 0.95;
      dl.forEach(t => { text(t, X.d, ry, { f: 'S', size: 8.8, color: C.ink }); ry += lh(8.8, 1.3); });
      det.forEach(t => { text(t, X.d, ry, { size: 7.6, color: C.muted }); ry += lh(7.6, 1.3); });
      const vy = y + 3.6 + 8.8 * mmPerPt * 0.95;
      text(fmtQty(l.qty), X.q, vy, { size: 8.8, color: C.ink, align: 'right' });
      text(fmtMoney(sign * (Number(l.unit) || 0)), X.u, vy, { size: 8.8, color: C.ink, align: 'right' });
      text(fmtMoney(sign * lineTotal(l)), X.t, vy, { f: 'S', size: 8.8, color: C.navy, align: 'right' });
      y += h;
      doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.2); doc.line(M, y, R, y);
    });

    /* --- Totaux --- */
    const totals = inv.totals || computeTotals(inv.lines, inv.vat, sign);
    const subj = inv.vat && inv.vat.mode === 'subject';
    const totRows = subj ? 3 : 2;
    const needTot = 6 + totRows * 6.2 + 14;
    if (y + needTot > BOTTOM) newPage();
    y += 6;
    const tx = 118;
    const rowsT = [['Total HT', fmtMoney(totals.ht)]];
    if (subj) {
      rowsT.push(['TVA ' + String(inv.vat.rate).replace('.', ',') + NB + '%', fmtMoney(totals.tva)]);
      rowsT.push(['Total TTC', fmtMoney(totals.ttc)]);
    } else {
      rowsT.push(['TVA', inv.vat && inv.vat.mode === 'exempt' ? 'Exonérée' : 'Non applicable']);
    }
    const yTot = y;
    rowsT.forEach(r => {
      text(r[0], tx + 3, y + 4.2, { size: 8.6, color: C.muted });
      text(r[1], R - 3, y + 4.2, { f: 'S', size: 8.6, color: C.ink, align: 'right' });
      y += 6.2;
      doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.2); doc.line(tx, y, R, y);
    });
    y += 2.4;
    doc.setFillColor.apply(doc, isCredit ? C.navy : C.teal);
    doc.roundedRect(tx, y, R - tx, 12, 2.4, 2.4, 'F');
    text(isCredit ? 'MONTANT DE L’AVOIR' : 'NET À PAYER', tx + 4, y + 7.6, { f: 'B', size: 7.6, color: C.white, cs: 0.4 });
    text(fmtMoney(totals.ttc), R - 4, y + 8.1, { f: 'B', size: 13, color: C.white, align: 'right' });
    const yAfterTot = y + 12;

    // Mention TVA + tampon « acquittée », à gauche des totaux
    let ly = yTot + 4.2;
    const mention = vatMention(inv.vat);
    if (mention) {
      wrap(mention, 92, 'S', 8.2).forEach(t => { text(t, M, ly, { f: 'S', size: 8.2, color: C.ink }); ly += lh(8.2, 1.3); });
      ly += 1.5;
    }
    if (subj && seller.vatNumber) { /* déjà en en-tête */ }
    if (opts.paid && inv.status && inv.status.paidAt && !isCredit) {
      const sy = Math.max(ly + 1, yTot + 8);
      doc.setDrawColor.apply(doc, C.stamp); doc.setLineWidth(0.6);
      doc.roundedRect(M, sy, 70, 15, 2.4, 2.4, 'S');
      text('FACTURE ACQUITTÉE', M + 5, sy + 6.3, { f: 'B', size: 9.4, color: C.stamp, cs: 0.4 });
      const pm = inv.status.paidMethod ? ' par ' + methodLong(inv.status.paidMethod) : '';
      text('Réglée le ' + fmtDate(inv.status.paidAt) + pm, M + 5, sy + 11.3, { size: 7.8, color: C.stamp });
      ly = sy + 15;
    }
    y = Math.max(yAfterTot, ly) + 9;

    /* --- Règlement & mentions --- */
    const pay = [];
    if (isCredit) {
      pay.push({ t: 'Cet avoir annule la facture n°' + NB + ((inv.creditOf && inv.creditOf.number) || '') + '. Son montant vous sera remboursé ou déduit d’une prochaine facture.', size: 8 });
    } else {
      pay.push({ t: 'Échéance : ' + dueSentence(inv) + '.', size: 8, f: 'S' });
      if ((inv.methods || []).length) pay.push({ t: 'Moyens de paiement acceptés : ' + methodsText(inv.methods) + '.', size: 8 });
      if ((inv.methods || []).includes('virement') && seller.iban) {
        pay.push({ t: 'IBAN : ' + fmtIban(seller.iban) + (seller.bic ? '   ·   BIC : ' + String(seller.bic).toUpperCase() : ''), size: 8, f: 'S' });
      }
      if (isPro) pay.push({ t: proLateText(inv.terms), size: 7.3, color: C.muted });
    }
    const payLines = [];
    pay.forEach(p => wrap(p.t, W, p.f || 'R', p.size).forEach(t => payLines.push({ t, size: p.size, f: p.f || 'R', color: p.color || C.ink })));
    const noteLines = inv.notes ? wrap(inv.notes, W, 'R', 8) : [];
    const needPay = 6 + payLines.reduce((a, l) => a + lh(l.size, 1.35), 0) + (noteLines.length ? 8 + noteLines.length * lh(8, 1.35) : 0) + 12;
    if (y + needPay > BOTTOM) newPage();

    label(isCredit ? 'Informations' : 'Règlement', M, y);
    y += 5;
    payLines.forEach(l => { text(l.t, M, y, l); y += lh(l.size, 1.35); });
    if (noteLines.length) {
      y += 3.5;
      label('Note', M, y);
      y += 5;
      noteLines.forEach(t => { text(t, M, y, { size: 8, color: C.ink }); y += lh(8, 1.35); });
    }
    if (inv.thanks && !isCredit) {
      y += 5;
      text(inv.thanks, M, y, { f: 'S', size: 9, color: C.tealDark });
    }

    /* --- Pied de page sur chaque page --- */
    const n = doc.getNumberOfPages();
    const legal1 = [seller.tradeName, sellerName(seller), sellerLines(seller).join(', '), seller.siret ? 'SIRET ' + fmtSiret(seller.siret) : ''].filter(Boolean).join('  ·  ');
    const legal2 = insuranceText(inv.insurance || seller.insurance);
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setDrawColor.apply(doc, C.line); doc.setLineWidth(0.25); doc.line(M, 279, R, 279);
      let fy = 283.2;
      wrap(legal1, 138, 'R', 6.5).forEach(t => { text(t, M, fy, { size: 6.5, color: C.muted }); fy += lh(6.5, 1.3); });
      if (legal2) wrap(legal2, 138, 'R', 6.5).forEach(t => { text(t, M, fy, { size: 6.5, color: C.muted }); fy += lh(6.5, 1.3); });
      text((isCredit ? 'Avoir ' : 'Facture ') + (inv.number || ''), R, 283.2, { f: 'S', size: 6.8, color: C.navy, align: 'right' });
      text('Page ' + p + '/' + n, R, 286.6, { size: 6.5, color: C.muted, align: 'right' });
    }
    return doc;
  }

  /* ---------- Exports CSV ---------- */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s; // pas de formule involontaire dans Excel
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvMoney(c) { return ((Number(c) || 0) / 100).toFixed(2).replace('.', ','); }
  function toCSV(rows) { return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n'; }

  root.FanapaCore = {
    MONTHS, METHODS, DEFAULT_PENALTY, DEFAULT_SUBJECT, DEFAULT_BODY,
    todayISO, parseISO, addDays, fmtDate, fmtDateLong, fmtMoney, fmtQty, eurosToCents, centsToInput,
    upper, digits, fmtSiret, fmtIban, fmtPhone,
    validSiret, validSiren, validIban, validEmail,
    methodLong, methodLabel, methodsText, vatMention, computeTotals, lineTotal,
    sellerName, sellerLines, clientAddressLines, serviceText, dueShort, dueSentence, proLateText, insuranceText,
    cleanPrefix, seriesKey, formatNumber, nextSeq,
    mailFields, fillTemplate, buildMail, reminderLabel, buildReminderMail,
    buildInvoicePDF, pdfClean, csvMoney, toCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);
