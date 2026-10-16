// Minimal in-memory Google Apps Script mock for simulation
process.env.TZ = 'Asia/Seoul';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

class Range {
  constructor(sheet, r, c, nr, nc) {
    if (nr < 1 || nc < 1) throw new Error(`The number of rows/columns in the range must be at least 1 (got ${nr}x${nc})`);
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some(r => r.length !== this.nc)) {
      throw new Error(`setValues size mismatch: range ${this.nr}x${this.nc}, data ${vals.length}x${vals[0] && vals[0].length}`);
    }
    vals.forEach((row, i) => row.forEach((v, j) => {
      const R = this.r - 1 + i, C = this.c - 1 + j;
      while (this.sheet.data.length <= R) this.sheet.data.push([]);
      if (v === undefined || v === null) v = '';
      if (typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Date]') throw new Error('Unsupported cell value object at ' + R + ',' + C);
      this.sheet.data[R][C] = v;
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat(f) { this.sheet.formats.push({ r: this.r, c: this.c, nr: this.nr, f }); return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; this.formats = []; this.frozen = 0; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some(v => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.data.forEach(r => (r || []).forEach((v, j) => { if (v !== '' && v !== undefined) m = Math.max(m, j + 1); }));
    return m;
  }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows(n) { this.frozen = n; }
  autoResizeColumns() {}
}

class Spreadsheet {
  constructor() { this.sheets = [new Sheet('시트1')]; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

function createContext(projectDir, files) {
  const ss = new Spreadsheet();
  const alerts = [];
  const ui = {
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
    Button: { YES: 'YES', NO: 'NO' },
    nextAnswer: 'YES',
    alert(title, msg) { alerts.push({ title, msg }); return ui.nextAnswer; },
    createMenu(name) { const m = { name, items: [], addItem(l, f) { m.items.push([l, f]); return m; }, addSeparator() { return m; }, addToUi() { ui.menu = m; } }; return m; },
    showModalDialog(html, title) { ui.dialog = { html, title }; }
  };
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {} },
    Session: {
      getScriptTimeZone: () => 'Asia/Seoul',
      getActiveUser: () => ({ getEmail: () => ctx.__activeEmail || '' })
    },
    Utilities: {
      formatDate(d, tz, fmt) {
        const map = { yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1), dd: pad(d.getDate()), HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()) };
        if (!/^(yyyy|MM|dd|HH|mm|ss|[-: ])+$/.test(fmt)) throw new Error('mock formatDate unsupported format: ' + fmt);
        return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, t => map[t]);
      }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() { ctx.__lockReleased = (ctx.__lockReleased || 0) + 1; } }) },
    Logger: { log() {} },
    HtmlService: {
      createTemplateFromFile(n) {
        const tpl = { file: n };
        tpl.evaluate = () => {
          const o = { setTitle() { return o; }, addMetaTag() { return o; }, setWidth() { return o; }, setHeight() { return o; }, file: n, startView: tpl.startView };
          return o;
        };
        return tpl;
      },
      createHtmlOutputFromFile(n) {
        const o = {
          file: n, title: '',
          getContent: () => fs.readFileSync(path.join(projectDir, n + '.html'), 'utf8'),
          setTitle(t) { o.title = t; return o; }, addMetaTag() { return o; }, setWidth() { return o; }, setHeight() { return o; }
        };
        return o;
      }
    }
  };
  vm.createContext(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(projectDir, f), 'utf8'), ctx, { filename: f }));
  return { ctx, ss, ui, alerts, run: code => vm.runInContext(code, ctx) };
}

module.exports = { createContext };
