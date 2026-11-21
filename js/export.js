/**
 * Xuất LBG của tôi ra file Excel (.xlsx) và Word (.docx) – chạy hoàn toàn trong trình duyệt,
 * không cần thư viện ngoài (tự đóng gói ZIP kiểu "store", không nén).
 *
 * Đầu vào: kết quả LbgRules.generate() + khung Mẫu LBG của trường (gắn ở lbg.js)
 *   { title, range, columns: [{ key, label }],
 *     days: [{ label, rows: [{ tiet, session, ppct, mon, tenBai, ddhd }] }],
 *     footer: { dateLine, role, leader } }
 * Bố cục cột theo res.columns; ô "Thứ/ngày" và "Buổi học" được gộp dòng.
 */
const LbgExport = (() => {
  const DEFAULT_COLUMNS = [
    { key: "day", label: "Thứ/ ngày" }, { key: "tiet", label: "Tiết" }, { key: "ppct", label: "Tiết theo PPCT" },
    { key: "mon", label: "Môn" }, { key: "tenBai", label: "Tên bài" }, { key: "ddhd", label: "ĐDDH" },
  ];
  const columnsOf = (res) => (res.columns && res.columns.length ? res.columns : DEFAULT_COLUMNS);
  // Căn lề theo cột
  const ALIGN = { day: "center", session: "center", tiet: "center", ppct: "center", mon: "left", tenBai: "left", ddhd: "center" };
  const BOLD = { day: true, session: true };

  /**
   * Ghi chú kiểm tra của hệ thống (Rule 3.2, 3.4) – CHỈ hiển thị trên màn hình,
   * KHÔNG đưa vào Copy / In / Excel / Word. Nếu người dùng đã tự sửa ô Tên bài
   * thành nội dung khác thì vẫn xuất nội dung đó.
   */
  const NOTES = new Set([LbgRules.NOT_EXIST, LbgRules.OVER].map((s) => normName(s)));
  const isNote = (v) => NOTES.has(normName(v));
  const exportValue = (key, v) => (key === "tenBai" && isNote(v) ? "" : v ?? "");

  /**
   * Lưới dữ liệu (đã bỏ ghi chú): mỗi dòng gồm các ô { key, value, span }.
   * span = n (ô bắt đầu, gộp n dòng) | 1 (ô thường) | 0 (nằm trong ô đã gộp)
   * Dùng chung cho Copy, In, Excel, Word -> cả 4 đều chỉ có nội dung, không ghi chú / màu.
   */
  function grid(res) {
    const cols = columnsOf(res);
    const out = [];
    res.days.forEach((d) => {
      const n = d.rows.length;
      const sesSpan = new Array(n).fill(0);
      for (let i = 0; i < n;) {
        let j = i;
        while (j < n && d.rows[j].session === d.rows[i].session) j++;
        sesSpan[i] = j - i;
        i = j;
      }
      d.rows.forEach((r, ri) => {
        out.push(cols.map((c) => {
          if (c.key === "day") return { key: c.key, value: ri === 0 ? d.label : "", span: ri === 0 ? n : 0 };
          if (c.key === "session") return { key: c.key, value: sesSpan[ri] ? r.session || "" : "", span: sesSpan[ri] };
          return { key: c.key, value: exportValue(c.key, r[c.key]), span: 1 };
        }));
      });
    });
    return out;
  }

  /** Escape XML + bỏ ký tự điều khiển không hợp lệ trong XML */
  const x = (s) => String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ======================= ZIP (store) ======================= */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** files: [{ name, data: string }] -> Blob */
  function zip(files, mime) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const local = [], central = [];
    let offset = 0;

    files.forEach((f) => {
      const name = enc.encode(f.name);
      const data = enc.encode(f.data);
      const crc = crc32(data);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);          // version needed
      lh.setUint16(6, 0x0800, true);      // UTF-8 file names
      lh.setUint16(8, 0, true);           // store
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      local.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);     // các trường còn lại = 0
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    });

    const cdSize = central.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...local, ...central, new Uint8Array(end.buffer)], { type: mime });
  }

  /* ======================= EXCEL (.xlsx) ======================= */
  const colLetter = (i) => String.fromCharCode(65 + i); // A, B, C… (≤ 26 cột)
  // Kiểu ô (cellXfs) – xem styles.xml bên dưới
  const S = { title: 1, range: 2, head: 3, center: 4, left: 5, day: 6, footItalic: 7, footBold: 8 };
  const XLSX_WIDTH = { day: 13, session: 9, tiet: 6, ppct: 9, mon: 16, tenBai: 48, ddhd: 14 };

  const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="12"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><sz val="14"/><name val="Times New Roman"/><family val="1"/></font>
<font><i/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font>
<font><b/><i/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE9EEF6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function cell(ref, value, style) {
    const v = value ?? "";
    if (typeof v === "number" || (/^\d{1,6}$/.test(String(v)) && String(v) === String(+v))) {
      return `<c r="${ref}" s="${style}"><v>${+v}</v></c>`;
    }
    if (String(v) === "") return `<c r="${ref}" s="${style}"/>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }

  function toXlsx(res) {
    const rows = [];
    const merges = [];
    let r = 0;
    const addRow = (cells, ht) => { r++; rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells(r)}</row>`); return r; };

    const cols = columnsOf(res);
    const last = colLetter(cols.length - 1);
    const footFrom = colLetter(Math.max(0, cols.length - 3)); // phần ký: 3 cột cuối
    const styleOf = (key) => (BOLD[key] ? S.day : ALIGN[key] === "left" ? S.left : S.center);

    addRow((n) => cell(`A${n}`, res.title, S.title), 22);  merges.push(`A${r}:${last}${r}`);
    addRow((n) => cell(`A${n}`, res.range, S.range));      merges.push(`A${r}:${last}${r}`);
    addRow(() => "");
    addRow((n) => cols.map((c, i) => cell(`${colLetter(i)}${n}`, c.label, S.head)).join(""), 32);
    const headRow = r;

    grid(res).forEach((line) => {
      addRow((n) => line.map((c, i) => cell(`${colLetter(i)}${n}`, c.value, styleOf(c.key))).join(""));
      line.forEach((c, i) => { if (c.span > 1) merges.push(`${colLetter(i)}${r}:${colLetter(i)}${r + c.span - 1}`); });
    });

    addRow(() => "");
    addRow((n) => cell(`${footFrom}${n}`, res.footer.dateLine, S.footItalic)); merges.push(`${footFrom}${r}:${last}${r}`);
    addRow((n) => cell(`${footFrom}${n}`, res.footer.role, S.footBold));       merges.push(`${footFrom}${r}:${last}${r}`);
    addRow(() => ""); addRow(() => ""); addRow(() => "");
    addRow((n) => cell(`${footFrom}${n}`, res.footer.leader, S.footBold));     merges.push(`${footFrom}${r}:${last}${r}`);

    const widths = cols.map((c) => XLSX_WIDTH[c.key] || 12);
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15.75"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${rows.join("")}</sheetData>
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>
<pageMargins left="0.5" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

    const sheetName = String(res.title || "LBG").replace(/[\\\/?*\[\]:]/g, "").slice(0, 31) || "LBG";
    return zip([
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${x(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { name: "xl/worksheets/sheet1.xml", data: sheet },
      { name: "xl/styles.xml", data: XLSX_STYLES },
    ], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  /* ======================= WORD (.docx) ======================= */
  const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
  // Độ rộng tương đối các cột (dxa), được co giãn cho tổng = 10100 (~ A4 dọc)
  const DOCX_WIDTH = { day: 1250, session: 850, tiet: 600, ppct: 900, mon: 1500, tenBai: 3650, ddhd: 1350 };
  const PAGE_W = 10100;

  const run = (t, { b = false, i = false, sz = 24 } = {}) =>
    `<w:r><w:rPr>${FONT}${b ? "<w:b/>" : ""}${i ? "<w:i/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const para = (t, { jc = "left", ind = "", ...o } = {}) =>
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${ind}<w:jc w:val="${jc}"/></w:pPr>${t === "" ? "" : run(t, o)}</w:p>`;
  const tc = (w, t, { vm = "", b = false, jc = "left" } = {}) => {
    const vmx = vm === "restart" ? '<w:vMerge w:val="restart"/>' : vm === "cont" ? "<w:vMerge/>" : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${vmx}<w:vAlign w:val="center"/></w:tcPr>${para(String(t ?? ""), { jc, b, sz: 24 })}</w:tc>`;
  };

  function toDocx(res) {
    const cols = columnsOf(res);
    const raw = cols.map((c) => DOCX_WIDTH[c.key] || 1000);
    const total = raw.reduce((s, v) => s + v, 0);
    const widths = raw.map((v) => Math.round((v * PAGE_W) / total));
    const border = 'w:val="single" w:sz="4" w:space="0" w:color="000000"';
    let body = "";
    body += para(res.title, { jc: "center", b: true, sz: 28 });
    body += para(res.range, { jc: "center", b: true, i: true, sz: 26 });
    body += para("");
    body += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>
<w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders>
<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
    body += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cols.map((c, i) => tc(widths[i], c.label, { b: true, jc: "center" })).join("")}</w:tr>`;
    grid(res).forEach((line) => {
      body += '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
      body += line.map((c, i) => tc(widths[i], c.span === 0 ? "" : c.value, {
        vm: c.span === 0 ? "cont" : c.span > 1 ? "restart" : "",
        b: !!BOLD[c.key],
        jc: ALIGN[c.key] || "left",
      })).join("");
      body += "</w:tr>";
    });
    body += "</w:tbl>";
    const ind = '<w:ind w:left="5400"/>';
    body += para("");
    body += para(res.footer.dateLine, { jc: "center", i: true, ind });
    body += para(res.footer.role, { jc: "center", b: true, ind });
    body += para("") + para("") + para("");
    body += para(res.footer.leader, { jc: "center", b: true, ind });
    body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="950" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';

    return zip([
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>` },
      { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` },
    ], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  /* ======================= Copy (dán vào Word / Excel) ======================= */
  function toClipboard(res) {
    const cols = columnsOf(res);
    const esc = (s) => x(s).replace(/'/g, "&#39;");
    const bd = "border:1px solid #000;padding:3px 5px;vertical-align:middle;";
    const tsv = [cols.map((c) => c.label).join("\t")];
    const rows = grid(res).map((line) => {
      tsv.push(line.map((c) => (c.span === 0 ? "" : c.value)).join("\t"));
      return `<tr>${line.filter((c) => c.span !== 0).map((c) =>
        `<td${c.span > 1 ? ` rowspan="${c.span}"` : ""} style="${bd}text-align:${ALIGN[c.key] || "left"};${BOLD[c.key] ? "font-weight:bold;" : ""}">${esc(c.value)}</td>`).join("")}</tr>`;
    });
    const html = `
    <div style="font-family:'Times New Roman';font-size:13pt">
      <p style="text-align:center;font-weight:bold;font-size:15pt;margin:0">${esc(res.title)}</p>
      <p style="text-align:center;font-weight:bold;font-style:italic;margin:0 0 8px">${esc(res.range)}</p>
      <table style="border-collapse:collapse;width:100%">
        <tr>${cols.map((c) => `<th style="${bd}">${esc(c.label)}</th>`).join("")}</tr>
        ${rows.join("")}
      </table>
      <p style="text-align:right;margin-top:10px"><i>${esc(res.footer.dateLine)}</i></p>
      <p style="text-align:right"><b>${esc(res.footer.role)}</b></p><br/><br/>
      <p style="text-align:right"><b>${esc(res.footer.leader)}</b></p>
    </div>`;
    return { html, text: tsv.join("\n") };
  }

  /* ======================= Tải file ======================= */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Tên file: "LBG tuần N của tôi" */
  function baseName(week) {
    const w = String(week ?? "").trim();
    return `LBG tuần ${w} của tôi`.replace(/[\\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  }

  /** Bản HTML sạch để IN (chỉ nội dung, đen trắng, khổ A4) */
  function toPrintHtml(res) {
    return toClipboard(res).html;
  }

  return { toXlsx, toDocx, toClipboard, toPrintHtml, download, baseName, crc32 };
})();
