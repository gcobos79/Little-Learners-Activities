const { chromium } = require('playwright'); const makeMock=require('./mocksb.js');
const ok=(c,m)=>console.log((c?'PASS ':'FAIL ')+m);
(async()=>{const b=await chromium.launch(); const mock=makeMock();
const ctx=await b.newContext(); await ctx.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**',mock.handler); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/little-learners-activities/index.html');
// Same situation as the teacher's account: new (empty) folders + older ones with quizzes, plus a nested duplicate.
await p.evaluate(()=>{localStorage.clear();
 const F=[{id:'folder-1792967533315-embng',name:'English',parentId:null,color:'#CFE8F7'},{id:'folder-1792914576041-vnenn',name:'English',parentId:null,color:'#F8EDB8'},
 {id:'folder-1792967547261-fg6bs',name:'Español',parentId:null,color:'#F6D6D6'},{id:'folder-1792914497974-36fl6',name:'español ',parentId:null,color:'#F6D6D6'},
 {id:'folder-1792967600000-aaaaa',name:'Letras',parentId:'folder-1792967547261-fg6bs'},{id:'folder-1792914600000-bbbbb',name:'Letras',parentId:'folder-1792914497974-36fl6'}];
 const q=(id,f)=>({id,familyId:id,type:'quiz',name:id,version:1,folderId:f,config:{visibility:'visible',questions:[{text:'a',options:[{text:'b',correct:true},{text:'c'}]}]},updatedAt:'2026-10-25T10:00:00.000Z'});
 localStorage.setItem('ll-activities-v90-folders',JSON.stringify(F));
 localStorage.setItem('ll-activities-v10-templates',JSON.stringify([q('q1','folder-1792914497974-36fl6'),q('q2','folder-1792967547261-fg6bs'),q('q3','folder-1792967600000-aaaaa'),q('q4','folder-1792914600000-bbbbb')]));});
await p.reload(); await p.waitForTimeout(300);
await p.fill('input[type=email]','teacher@test.org'); await p.fill('input[type=password]','secreto123'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(300);
await p.click('.modal button:has-text("Subir a mi cuenta")'); await p.waitForTimeout(2500);
const r=await p.evaluate(()=>({f:LL.store.folders().map(f=>f.id+':'+f.name+':'+(f.parentId||'')),q:LL.store.quizzes().map(q=>q.id+':'+q.folderId)}));
console.log(JSON.stringify(r,null,0));
ok(r.f.length===3,'local: 2 English + 2 Español + 2 Letras became 3 folders');
ok(r.q.every(x=>!x.includes('1792967')),'local: all quizzes moved into the kept (original) folders');
const live=mock.db.folders.filter(f=>!f.deleted_at).map(f=>f.name);
ok(live.length===3,'cloud: only 3 folders left ('+live.join(', ')+'); duplicates marked deleted: '+mock.db.folders.filter(f=>f.deleted_at).length);
// Block creating a duplicate name
await p.focus('.teacher-gate'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.click('#newFolderBtn'); await p.fill('.modal input[type=text]','ENGLISH'); await p.click('.modal button:has-text("Crear carpeta")'); await p.waitForTimeout(400);
ok((await p.evaluate(()=>LL.store.folders().length))===3,'teacher: cannot create a second "English" folder');
// Second tablet with the old duplicate copy receives deletions and ends with 3
const ctx2=await b.newContext(); await ctx2.route('https://abbtbaupzdzdvtkunmtf.supabase.co/**',mock.handler); const p2=await ctx2.newPage();
await p2.goto('file:///home/claude/little-learners-activities/index.html'); await p2.evaluate(()=>localStorage.clear()); await p2.reload(); await p2.waitForTimeout(300);
await p2.fill('input[type=email]','teacher@test.org'); await p2.fill('input[type=password]','secreto123'); await p2.click('button:has-text("Entrar")'); await p2.waitForTimeout(2500);
ok((await p2.evaluate(()=>LL.store.folders().length))===3,'tablet: sees 3 folders');
console.log('errors',errs); await b.close();})();
