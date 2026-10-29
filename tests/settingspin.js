// Ajustes (V127): opens without the PIN; actions that change, delete or take data out ask for the PIN once
// per visit; a wrong PIN shows «PIN incorrecto» + Aceptar and does nothing; leaving Ajustes locks again.
const { chromium } = require('playwright');
const path = require('path');
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ll-v122-local-mode', '1'); });
  await p.reload(); await p.waitForTimeout(400);
  const typePin = async (pin) => { await p.waitForSelector('.pin-pad'); await p.keyboard.type(pin); await p.keyboard.press('Enter'); await p.waitForTimeout(300); };
  const screen = () => p.evaluate(() => LL.app.state.screen);
  const pad = async () => !!(await p.$('.pin-pad'));
  // No PIN yet: Ajustes opens, and creating the PIN doesn't ask for one.
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  assert((await screen()) === 'backup' && !(await pad()), 'no PIN set: Ajustes opens directly');
  await p.click('button:has-text("Crear PIN")'); await typePin('1234'); await typePin('1234'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => !!LL.store.pinHash()), 'PIN created');
  await p.click('.tab:has-text("Actividades")'); await p.waitForTimeout(300);

  // With a PIN: Ajustes still opens without it
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(400);
  assert((await screen()) === 'backup' && !(await pad()), 'with a PIN: Ajustes opens without asking');
  assert(await p.isVisible('.settings-lock:has-text("se pide el PIN")'), 'Ajustes explains that changes ask for the PIN');
  // Looking around is free: «Ver como invitado» needs no PIN (it only shows things)
  // A protected action asks; a wrong PIN does nothing
  await p.click('button:has-text("Liberar espacio")'); await p.waitForTimeout(300);
  assert(await p.isVisible('.modal:has-text("PIN para hacer cambios en Ajustes")'), '«Liberar espacio» asks for the PIN');
  await typePin('9999');
  assert(await p.isVisible('.modal:has-text("PIN incorrecto")') && await p.isVisible('.modal button:has-text("Aceptar")'), 'wrong PIN: «PIN incorrecto» with «Aceptar»');
  await p.click('.modal button:has-text("Aceptar")'); await p.waitForTimeout(300);
  assert(!(await p.$('.modal')) && (await screen()) === 'backup', 'after Aceptar: nothing done, still in Ajustes');
  // Cancel does nothing either
  await p.click('button:has-text("Borrar este dispositivo")'); await p.waitForSelector('.pin-pad');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  assert(!(await p.$('.modal')), 'Cancelar on the PIN: the delete dialog never opens');
  // Right PIN: the action goes on
  await p.click('button:has-text("Liberar espacio")'); await typePin('1234'); await p.waitForTimeout(300);
  assert(await p.isVisible('.modal:has-text("Liberar espacio en este navegador")'), 'right PIN: the action continues');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  assert(await p.isVisible('.settings-lock:has-text("Cambios permitidos")'), 'Ajustes shows changes are allowed now');
  // Once per visit: the next action doesn't ask again
  await p.click('button:has-text("Borrar este dispositivo")'); await p.waitForTimeout(300);
  assert(!(await pad()) && await p.isVisible('.modal:has-text("¿Borrar todo?")'), 'second action in the same visit: no PIN again');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  // Info and back keeps it unlocked
  await p.click('.appbar-right .icon-btn[aria-label^="Información"]'); await p.waitForTimeout(300);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  await p.click('button:has-text("Liberar espacio")'); await p.waitForTimeout(300);
  assert(!(await pad()), 'Información and back: still unlocked');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  // Leaving Ajustes locks again
  await p.click('.tab:has-text("Estudiantes")'); await p.waitForTimeout(300);
  await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  assert(!(await pad()), 'coming back: Ajustes opens without the PIN');
  await p.click('button:has-text("Liberar espacio")'); await p.waitForTimeout(300);
  assert(await pad(), 'after leaving Ajustes, actions ask for the PIN again');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  // Change / remove PIN ask too
  await p.click('.tab:has-text("Actividades")'); await p.click('.tab:has-text("Ajustes")'); await p.waitForTimeout(300);
  await p.click('button:has-text("Quitar PIN")'); await p.waitForTimeout(300);
  assert(await pad(), '«Quitar PIN» asks for the PIN');
  await p.click('.modal button:has-text("Cancelar")'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => !!LL.store.pinHash()), 'PIN still there after cancelling');
  assert(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
