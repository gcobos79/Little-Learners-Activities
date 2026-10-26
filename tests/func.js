const { chromium } = require('playwright');
const seed=require('./seed.js');
const assert=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m)};
(async () => {
  const file=process.argv[2];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:1280,height:800}, acceptDownloads:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file://'+require('path').resolve(file));
  await p.evaluate(s=>{localStorage.clear();localStorage.setItem('ll-activities-v90-folders',JSON.stringify(s.folders));localStorage.setItem('ll-activities-v10-templates',JSON.stringify(s.library));localStorage.setItem('ll-v122-local-mode','1')},seed);
  await p.reload(); await p.waitForTimeout(500);
  const before=await p.evaluate(()=>localStorage.getItem('ll-activities-v10-templates'));
  // Student: hidden quiz & empty folders not shown; no teacher controls
  await p.click('.student-card >> nth=0'); await p.waitForTimeout(500);
  const names=await p.$$eval('#cardGrid .name',a=>a.map(x=>x.textContent));
  assert(!names.includes('Matemáticas')&&!names.includes('Borradores'),'student: folders with nothing ready are hidden');
  assert(!(await p.isVisible('#newQuizBtn'))&&!(await p.isVisible('#newFolderBtn')),'student: no create buttons');
  assert((await p.$$('.card-tools')).length===0,'student: no edit/menu tools on cards');
  await p.click('.card.quiz:has-text("Colores")',{button:'right'}); await p.waitForTimeout(200);
  assert((await p.$$('.menu')).length===0,'student: right-click opens no admin menu');
  await p.keyboard.press('Escape'); if(await p.isVisible('#player')) await p.click('#playerExit');
  await p.click('#cardGrid >> text=Español'); await p.waitForTimeout(400);
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  await p.click('.student-card >> nth=1'); await p.waitForTimeout(500);
  assert((await p.textContent('#crumbs')).includes('Actividades')&&!(await p.textContent('#crumbs')).includes('Español'),'student: always starts at top level');
  const after=await p.evaluate(()=>localStorage.getItem('ll-activities-v10-templates'));
  assert(before===after,'student browsing does not modify library data');
  await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300);
  // Teacher via keyboard Enter
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert(await p.isVisible('#newQuizBtn'),'teacher: keyboard Enter opens teacher area');
  // Create quiz
  await p.click('#newQuizBtn'); await p.waitForTimeout(400);
  await p.fill('#edName','Prueba nueva');
  await p.fill('#edQuestion textarea','¿Cuál es azul?');
  const inputs=await p.$$('#edQuestion .answer input[type=text]');
  await inputs[0].fill('🔵'); await inputs[1].fill('🔴'); await inputs[2].fill('🟢'); await inputs[3].fill('🟡');
  // make visible without correct answer -> save blocked
  await p.click('label.switch:has-text("Visible para estudiantes")');
  await p.click('text=💾 Guardar'); await p.waitForTimeout(300);
  let saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('ll-activities-v10-templates')).some(x=>x.name==='Prueba nueva'));
  assert(!saved,'editor: visible quiz with no correct answer is not saved');
  await p.click('.answer >> nth=0 >> .correct-toggle'); await p.waitForTimeout(100);
  await p.click('text=💾 Guardar'); await p.waitForTimeout(300);
  const q=await p.evaluate(()=>JSON.parse(localStorage.getItem('ll-activities-v10-templates')).find(x=>x.name==='Prueba nueva'));
  assert(q&&q.type==='quiz'&&q.version===1&&q.familyId===q.id&&q.config.visibility==='visible'&&q.config.questions[0].correctCount===1&&q.config.questions[0].options[0].correct,'editor: saved in V121 format');
  // Edit then leave -> prompt
  await p.fill('#edName','Prueba nueva 2');
  await p.click('.tab >> nth=1'); await p.waitForTimeout(300);
  assert(await p.isVisible('.modal:has-text("¿Guardar los cambios?")'),'editor: warns about unsaved changes');
  await p.click('.modal >> text=Seguir editando'); await p.waitForTimeout(200);
  // draft recovery: reload page
  await p.reload(); await p.waitForTimeout(400);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('.card.quiz:has-text("Prueba nueva") >> text=Editar'); await p.waitForTimeout(400);
  assert(await p.isVisible('.modal:has-text("Recuperar")'),'editor: offers draft recovery after reload');
  await p.click('.modal button:has-text("Recuperar")'); await p.waitForTimeout(300);
  assert((await p.inputValue('#edName'))==='Prueba nueva 2','editor: draft restored');
  await p.click('text=💾 Guardar'); await p.waitForTimeout(300);
  await p.click('text=⬅️ Mis actividades'); await p.waitForTimeout(300);
  // Move quiz to folder via menu
  await p.click('.card.quiz:has-text("Prueba nueva 2") .icon-btn[aria-label^="Más opciones"]'); await p.click('.menu >> text=Mover'); await p.waitForTimeout(200);
  await p.selectOption('.modal select',{label:'📁 Matemáticas'}); await p.click('.modal button:has-text("Mover")'); await p.waitForTimeout(300);
  const moved=await p.evaluate(()=>JSON.parse(localStorage.getItem('ll-activities-v10-templates')).find(x=>x.name==='Prueba nueva 2').folderId);
  assert(moved==='folder-2','teacher: move quiz into folder');
  // Backup export
  await p.click('.tab >> nth=3'); await p.waitForTimeout(300);
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('button:has-text("📥 Descargar respaldo")')]);
  const path=await dl.path(); const backup=JSON.parse(require('fs').readFileSync(path,'utf8'));
  assert(backup.app==='little-learners-activities'&&backup.data['ll-activities-v10-templates'].length===6,'backup: export contains all library entries (incl. old quick_sort)');
  // delete all
  await p.click('text=Borrar este dispositivo…'); await p.fill('.modal input','BORRAR'); await p.click('.modal button:has-text("Borrar todo")'); await p.waitForTimeout(400);
  const left=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ll-')&&k!=='ll-v122-roster'));
  assert(left.length===0,'delete all: removes all data');
  // import
  await p.click('button:has-text("Usar sin cuenta")'); await p.waitForTimeout(300);
  await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.click('.tab >> nth=3'); await p.waitForTimeout(300);
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('text=📤 Elegir archivo…')]);
  await fc.setFiles(path); await p.waitForTimeout(400);
  await p.click('.modal >> text=Agregar a lo que ya tengo'); await p.waitForTimeout(400);
  const n=await p.evaluate(()=>JSON.parse(localStorage.getItem('ll-activities-v10-templates')||'[]').length);
  assert(n===6,'import: restores library from backup');
  // Sonidos iniciales launches
  await p.click('.tab >> nth=2'); await p.waitForTimeout(300);
  await p.click('#screen-sonidos-admin button:has-text("Probar")'); await p.waitForTimeout(1500);
  const tiles=await p.frameLocator('#sonidosFrame').locator('.tile').count();
  assert(tiles>0,'Sonidos iniciales: original activity starts ('+tiles+' tiles)');
  console.log('PAGE ERRORS',errs);
  await b.close();
})();
