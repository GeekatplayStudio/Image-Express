#!/usr/bin/env node
/**
 * UI layout sweep — drives the running app in headless Chromium and lists
 * every control that is outside the viewport, every clipped label, every
 * dialog that does not fit or scroll, and every header menu / toolbar window,
 * at four viewport sizes. Screenshots go next to the report.
 *
 * Usage:  npx next dev -p 3005 -H 127.0.0.1   (in another terminal)
 *         npm run qa:ui-sweep -- <output-dir>
 *
 * Findings tagged SCROLL-ONLY are reachable by scrolling a container and are
 * informational; OFFSCREEN / CLIPPED / DIALOG-* / TEXT-OVERFLOW are defects.
 */
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const OUT = process.argv[2] || 'ui-sweep-out';
fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const VIEWPORTS = [[1920,1080],[1366,768],[1024,700],[390,844]];
const report = [];
const log = (vp, scene, issue) => report.push(`[${vp}] ${scene}: ${issue}`);

// Collect layout problems: interactive elements outside viewport, text that overflows its box, dialogs that don't fit.
const LINT = () => {
  const vw = innerWidth, vh = innerHeight;
  const out = [];
  const describe = (el) => {
    const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim().slice(0,40) || '';
    return `<${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? ' testid='+el.getAttribute('data-testid') : ''}${el.className && typeof el.className==='string' ? ' .'+el.className.split(' ').slice(0,3).join('.') : ''}> "${label}"`;
  };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  for (const el of document.querySelectorAll('button,[role=button],a[href],input,select,textarea,[role=menuitem],[role=tab]')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) { let p = el.parentElement, sc = false; while (p) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX+cs.overflowY) && (p.scrollWidth>p.clientWidth||p.scrollHeight>p.clientHeight)) { sc = true; break; } p = p.parentElement; } if (sc && r.left >= 0 && r.right <= vw) continue; if (sc) { out.push(`SCROLL-ONLY ${describe(el)} at ${Math.round(r.left)},${Math.round(r.top)}`); continue; } out.push(`OFFSCREEN ${describe(el)} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`); continue; }
    if (r.left < -1 || r.top < -1 || r.right > vw+1 || r.bottom > vh+1) {
      // partially outside: is it inside a scrollable ancestor?
      let p = el.parentElement, scrollable = false;
      while (p) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX+cs.overflowY) && (p.scrollWidth>p.clientWidth||p.scrollHeight>p.clientHeight)) { scrollable = true; break; } p = p.parentElement; }
      if (!scrollable) out.push(`CLIPPED ${describe(el)} rect ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)} (vp ${vw}x${vh})`);
    }
  }
  // text overflow: elements whose text is wider than their box and not truncated/scrollable
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,label,button,option,li,td,th,a,div')) {
    if (!visible(el)) continue;
    if (el.children.length > 0 && ![...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.textOverflow !== 'ellipsis' && cs.whiteSpace !== 'nowrap') {
      out.push(`TEXT-OVERFLOW ${describe(el)} scroll ${el.scrollWidth} > box ${el.clientWidth}`);
    }
    if (el.scrollWidth > el.clientWidth + 2 && cs.whiteSpace === 'nowrap' && cs.textOverflow !== 'ellipsis' && cs.overflowX === 'visible') {
      // nowrap text spilling beyond its box
      let p = el.parentElement, clipped = false; while (p) { const pcs = getComputedStyle(p); if (pcs.overflow !== 'visible' && pcs.overflowX !== 'visible') { clipped = true; break; } p = p.parentElement; }
      if (clipped) out.push(`NOWRAP-SPILL ${describe(el)} scroll ${el.scrollWidth} > box ${el.clientWidth}`);
    }
  }
  for (const d of document.querySelectorAll('[role=dialog]')) {
    const r = d.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.left < -1 || r.top < -1 || r.right > vw+1 || r.bottom > vh+1) out.push(`DIALOG-OUT ${describe(d)} rect ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
    // body scroll: content taller than dialog but no scrollable region
    const scrollers = [...d.querySelectorAll('*')].filter(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight; });
    if (d.scrollHeight > d.clientHeight + 2 && scrollers.length === 0) out.push(`DIALOG-NOSCROLL ${describe(d)} content ${d.scrollHeight} > ${d.clientHeight}`);
  }
  // document-level horizontal scroll
  if (document.documentElement.scrollWidth > vw + 1) out.push(`PAGE-HSCROLL ${document.documentElement.scrollWidth} > ${vw}`);
  return out;
};

const browser = await chromium.launch();
for (const [w,h] of VIEWPORTS) {
  const vp = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log(vp, 'pageerror', e.message));
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('image-express-local-mode','1'); localStorage.setItem('image-express-setup-wizard-dismissed','1'); });
  const shot = async (name) => page.screenshot({ path: `${OUT}/shots/${vp}-${name}.png` });
  const lint = async (scene) => { for (const i of await page.evaluate(LINT)) log(vp, scene, i); };

  await page.goto('http://127.0.0.1:3005/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // dismiss setup wizard if shown
  const wiz = page.getByRole('dialog').filter({ hasText: /setup|wizard/i });
  if (await wiz.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await shot('dashboard'); await lint('dashboard');

  // Custom size → create → editor
  await page.getByRole('button', { name: /custom size/i }).first().click();
  await page.waitForTimeout(400); await shot('dashboard-customsize'); await lint('dashboard-customsize');
  const dlg = page.getByRole('dialog').last();
  const createBtn = dlg.getByRole('button').filter({ hasNotText: /cancel/i }).last();
  await createBtn.click();
  await page.waitForTimeout(2500);
  await shot('editor'); await lint('editor');
  { const tg = page.getByRole('button', { name: 'Toggle top menu bar' }).first(); if (await tg.count()) { await tg.click({ force: true, timeout: 5000 }).catch(e => log(vp,'menus','toggle click failed: '+String(e.message).split('\n')[0])); await page.waitForTimeout(400); await shot('editor-menubar'); await lint('editor-menubar'); } else log(vp,'menus','no menu bar toggle'); }

  // top menus
  for (const m of ['File','Edit','Image','Layer','Select','Tools','Filter','View','Window','Settings','Help']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${m}\\b`, 'i') }).first();
    if (!(await btn.count()) || !(await btn.isVisible())) { log(vp, 'menus', `menu trigger "${m}" not visible`); continue; }
    await btn.click(); await page.waitForTimeout(300);
    await shot(`menu-${m}`); await lint(`menu-${m}`);
    await page.keyboard.press('Escape'); await page.mouse.click(5, h-5); await page.waitForTimeout(200);
  }

  // toolbar: every button reachable?
  await lint('editor-toolbar');
  // open each tool via toolbar buttons and lint its options bar
  const toolButtons = await page.locator('aside button, [data-testid*=toolbar] button, nav button').all();
  log(vp, 'toolbar', `${toolButtons.length} toolbar/rail buttons found`);

  // Window menu → open every dialog-opening menu item across menus
  for (const m of ['File','Edit','Image','Layer','Select','Tools','Filter','View','Window','Settings','Help']) {
    const btn = page.getByRole('button', { name: new RegExp(`^${m}\\b`, 'i') }).first();
    if (!(await btn.count()) || !(await btn.isVisible())) continue;
    await btn.click(); await page.waitForTimeout(250);
    const items = await page.locator('[role=menu] button, [role=menuitem], .absolute button').allInnerTexts().catch(()=>[]);
    await page.keyboard.press('Escape'); await page.mouse.click(5, h-5); await page.waitForTimeout(150);
    for (const label of items.map(s=>s.trim()).filter(Boolean)) {
      if (/back to hub|exit|close|logout|sign out|delete|clear|reset|new|save|export|download|print|undo|redo|cut|copy|paste|duplicate|quit/i.test(label)) continue;
      await btn.click(); await page.waitForTimeout(200);
      const item = page.locator('[role=menu] button, [role=menuitem], .absolute button').filter({ hasText: label }).first();
      if (!(await item.count())) { await page.keyboard.press('Escape'); continue; }
      await item.click({ timeout: 2000 }).catch(()=>{});
      await page.waitForTimeout(600);
      const dialogs = page.getByRole('dialog');
      const n = await dialogs.count();
      if (n) { const safe = `${m}-${label.replace(/[^a-z0-9]+/gi,'_').slice(0,30)}`; await shot(`win-${safe}`); await lint(`window ${m}>${label}`); }
      for (let k=0;k<n+1;k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
      if (await page.getByRole('dialog').count()) { log(vp, `window ${m}>${label}`, 'dialog did not close on Escape'); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(2000); }
    }
  }

  // Toolbar pass: every rail button with a title; windows it opens must fit and close.
  const railNames = await page.locator('aside button[title], aside button[aria-label]').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('aria-label') || e.getAttribute('title') || '').filter(Boolean))]);
  for (const name of railNames) { try {
    if (!(await page.locator('aside').count())) { log(vp, 'toolbar', 'left the editor; returning'); await page.goto('http://127.0.0.1:3005/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500); await page.getByRole('button', { name: /custom size/i }).first().click(); await page.waitForTimeout(400); await page.getByRole('dialog').last().getByRole('button').filter({ hasNotText: /cancel/i }).last().click(); await page.waitForTimeout(2500); }
    const b = page.locator(`aside button[aria-label="${name}"], aside button[title="${name}"]`).first();
    if (!(await b.count())) { log(vp, 'toolbar', `rail button "${name}" disappeared`); continue; }
    if (!(await b.isVisible().catch(()=>false))) { log(vp, 'toolbar', `rail button "${name}" not visible`); continue; }
    const r = await b.boundingBox();
    if (r && (r.y + r.height > h + 1 || r.y < -1)) log(vp, 'toolbar', `rail button "${name}" outside viewport (y=${Math.round(r.y)})`);
    await b.click({ timeout: 2000 }).catch(()=>{});
    await page.waitForTimeout(500);
    const n = await page.getByRole('dialog').count();
    const fixedPanels = await page.evaluate(() => [...document.querySelectorAll('body > div, body > aside, body > section')].filter(e => { const cs = getComputedStyle(e); return cs.position === 'fixed' && e.getBoundingClientRect().width > 200; }).length);
    if (n || fixedPanels) { await shot(`tool-${name.replace(/[^a-z0-9]+/gi,'_').slice(0,30)}`); await lint(`toolbar "${name}"`); }
    for (let k=0;k<3;k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); }
    if (await page.getByRole('dialog').count()) { log(vp, `toolbar "${name}"`, 'dialog did not close on Escape'); await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(2000); }
  } catch (e) { log(vp, `toolbar "${name}"`, 'ERROR ' + String(e.message).split('\n')[0]); } }
  await ctx.close();
  fs.writeFileSync(`${OUT}/ui-sweep-report.txt`, report.join('\n'));
}
await browser.close();
fs.writeFileSync(`${OUT}/ui-sweep-report.txt`, report.join('\n'));
console.log(report.join('\n'));
