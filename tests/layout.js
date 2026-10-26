const { chromium } = require('playwright');
const seed=require('./seed.js');
const devices={
 chromebook:[1280,800,1.5,true], chromebookP:[800,1280,1.5,true],
 iphone:[390,844,3,true], iphoneL:[844,390,3,true], iphoneSE:[375,667,2,true],
 ipad:[820,1180,2,true], ipadL:[1180,820,2,true],
 laptop:[1440,900,1,false], wide:[2560,1080,1,false], fullhd:[1920,1080,1,false]};
(async () => {
  const file=process.argv[2], out=process.argv[3], only=process.argv[4];
  const b = await chromium.launch();
  const report={};
  for (const [name,[w,h,dpr,touch]] of Object.entries(devices)) {
    if (only && !only.split(',').includes(name)) continue;
    const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1, hasTouch:touch, isMobile:touch&&w<1000 });
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror', e=>errs.push(e.message));
    await p.goto('file://'+require('path').resolve(file));
    await p.evaluate(s=>{localStorage.clear();localStorage.setItem('ll-activities-v90-folders',JSON.stringify(s.folders));localStorage.setItem('ll-activities-v10-templates',JSON.stringify(s.library));localStorage.setItem('ll-v122-local-mode','1')},seed);
    await p.reload(); await p.waitForTimeout(900);
    const issues=[];
    const check=async(label)=>{
      const r=await p.evaluate(()=>{
        const res={hscroll:document.documentElement.scrollWidth>innerWidth+1, overlaps:[]};
        // text elements clipped horizontally beyond viewport
        const els=[...document.querySelectorAll('button,h1,h2,h3,.name,.meta,.label,.question-text,.badge,.student-chip,.tab')].filter(e=>e.offsetParent!==null||getComputedStyle(e).position==='fixed');
        for(const e of els){const r=e.getBoundingClientRect(); if(r.width&&(r.right>innerWidth+1||r.left<-1)) res.overlaps.push('offscreen: '+(e.className||e.tagName)+' '+e.textContent.trim().slice(0,30));}
        // player: options & question must fit within viewport
        const pl=document.querySelector('#player');
        if(pl&&!pl.hidden){const all=[...pl.querySelectorAll('.option,.question,.player-top')];for(const e of all){const r=e.getBoundingClientRect();if(r.bottom>innerHeight+1)res.overlaps.push('player overflow: '+e.className);}
          for(const o of pl.querySelectorAll('.option .label')){if(o.scrollWidth>o.parentElement.clientWidth+2)res.overlaps.push('label too wide: '+o.textContent)}}
        // overlapping siblings in appbar
        const ab=[...document.querySelectorAll('.appbar > *')].map(e=>e.getBoundingClientRect()).filter(r=>r.width);
        for(let i=0;i<ab.length;i++)for(let j=i+1;j<ab.length;j++){const a=ab[i],c=ab[j];if(a.left<c.right-1&&c.left<a.right-1&&a.top<c.bottom-1&&c.top<a.bottom-1)res.overlaps.push('appbar overlap '+i+'-'+j)}
        return res;});
      if(r.hscroll) issues.push(label+': horizontal scroll');
      r.overlaps.forEach(o=>issues.push(label+': '+o));
    };
    const shot=async n=>{await p.waitForTimeout(700);await check(n);await p.screenshot({path:`${out}/${name}-${n}.png`});};
    await shot('1home');
    await p.click('.student-card >> nth=0'); await p.waitForTimeout(400); await shot('2slib');
    await p.click('#cardGrid >> text=Colores'); await p.waitForTimeout(500); await shot('3player6');
    await p.evaluate(() => LL.player.close()); await p.waitForTimeout(200);
    await p.click('#cardGrid >> text=Español'); await p.waitForTimeout(300);
    await p.click('#cardGrid >> text=Letras'); await p.waitForTimeout(300);
    await p.click('#cardGrid >> text=Vocales'); await p.waitForTimeout(500); await shot('4player5');
    await p.click('.option >> nth=0'); await p.waitForTimeout(250); await shot('5correct');
    await p.waitForTimeout(2200); await shot('6finish');
    await p.click('.finish button:has-text("Salir")'); await p.waitForTimeout(400);
    await p.evaluate(()=>{document.querySelector('.teacher-gate').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}); await p.waitForTimeout(300);
    await shot('7tlib');
    await p.click('.card.quiz:has-text("Animales") >> text=Editar').catch(async()=>{await p.click('#cardGrid >> text=Español'); await p.waitForTimeout(300); await p.click('.card.quiz:has-text("Animales") >> text=Editar');});
    await p.waitForTimeout(300); await shot('8editor');
    await p.screenshot({path:`${out}/${name}-8editor-full.png`,fullPage:true});
    await p.click('.tab >> nth=3'); await p.waitForTimeout(300); await shot('9backup');
    await p.click('.appbar-right .icon-btn'); await p.waitForTimeout(300); await shot('10info');
    report[name]={issues:[...new Set(issues)],errs};
    await ctx.close();
  }
  console.log(JSON.stringify(report,null,1));
  await b.close();
})();
