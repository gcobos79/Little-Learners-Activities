// Ajustes asks for the PIN every time; a wrong PIN shows «PIN incorrecto» + Aceptar and stays (V125).
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const shot = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); });
  await p.reload(); await p.waitForTimeout(400);
  const typePin = async (pin) => { await p.waitForSelector('.pin-pad'); await p.keyboard.type(pin); await p.keyboard.press('Enter'); await p.waitForTimeout(300); };
  const screen = () => p.evaluate(() => LL.app.state.screen);
  // No PIN yet: Ajustes opens directly (that's where the PIN is created).
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  assert((await screen()) === 'backup' && !(await p.$('.pin-pad')), 'no PIN set: Ajustes opens directly');
  // Create PIN 1234.
  const set = p.evaluate(() => LL.auth.setPinFlow());
  await typePin('1234'); await typePin('1234'); await set; await p.waitForTimeout(200);
  await p.click('.tab:has-text("Actividades")'); await p.waitForTimeout(300);
  // Wrong PIN
  await p.click('.tab:has-text("Ajustes")');
  await p.waitForSelector('.pin-pad');
  assert(await p.isVisible('.modal:has-text("PIN para entrar a Ajustes")'), 'tapping Ajustes asks for the PIN');
  await typePin('9999');
  assert(await p.isVisible('.modal:has-text("PIN incorrecto")') && await p.isVisible('.modal button:has-text("Aceptar")'), 'wrong PIN: «PIN incorrecto» with an «Aceptar» button');
  if (shot) await p.screenshot({ path: shot });
  assert((await screen()) === 'library', 'still on Actividades while the message is shown');
  await p.click('.modal button:has-text("Aceptar")'); await p.waitForTimeout(300);
  assert((await screen()) === 'library' && !(await p.$('.modal')), 'after Aceptar: back where it was (Actividades)');
  // Cancel
  await p.click('.tab:has-text("Ajustes")'); await p.waitForSelector('.pin-pad');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  assert((await screen()) === 'library', 'Cancelar: stays on Actividades');
  // Right PIN
  await p.click('.tab:has-text("Ajustes")'); await typePin('1234');
  assert((await screen()) === 'backup', 'right PIN: Ajustes opens');
  // Info from Ajustes and back: no PIN again
  await p.click('.appbar-right .icon-btn[aria-label^="Información"]'); await p.waitForTimeout(300);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  assert((await screen()) === 'backup' && !(await p.$('.pin-pad')), 'coming back from Información to Ajustes: no PIN again');
  // Leave and come back: asks again
  await p.click('.tab:has-text("Estudiantes")'); await p.waitForTimeout(300);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  assert(!!(await p.$('.pin-pad')), 'leaving Ajustes and returning asks again');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  // Browser Back into Ajustes asks too; a wrong PIN keeps the current page.
  await p.goBack(); await p.waitForTimeout(500);
  const asked = !!(await p.$('.pin-pad'));
  if (asked) { await typePin('0000'); await p.click('.modal button:has-text("Aceptar")'); await p.waitForTimeout(400); }
  assert(asked && (await screen()) !== 'backup', 'browser Back into Ajustes: asks for the PIN; wrong PIN stays out (' + (await screen()) + ')');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
