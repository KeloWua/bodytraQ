// Run npm run build, serve out/ locally, then BODYTRAQ_TEST_URL=http://127.0.0.1:4173 node scripts/test-notes.mjs.
// All records are synthetic and live only in a new, isolated browser context.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const baseURL = process.env.BODYTRAQ_TEST_URL || 'http://127.0.0.1:4173';
const output = process.env.BODYTRAQ_TEST_OUTPUT || '/tmp/bodytraq-notes-test';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const viewport of [{width:390,height:844},{width:320,height:568},{width:1280,height:800}]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseURL);
    await page.getByRole('button', {name:'Crear el primer registro'}).click();
    await page.locator('input[type=date]').fill('2026-01-01');
    await page.locator('input[type=number]').fill('80');
    const multiline = 'Nota sintética de prueba\nSegunda línea\n\nPárrafo final';
    await page.locator('textarea').fill(multiline);
    await page.getByRole('button', {name:'Guardar',exact:true}).click();
    const region = page.getByRole('region',{name:'Notas del registro'});
    await region.waitFor();
    assert.equal(await region.textContent(), multiline);
    assert.equal(await region.evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');
    assert.equal(await region.evaluate(e=>e.closest('header')),null);
    await page.waitForFunction(() => [...document.getAnimations()].every(a => a.playState !== 'running'));
    await page.screenshot({path:`${output}/${viewport.width}-multiline.png`});
    await page.reload();
    await region.waitFor();
    assert.equal(await region.textContent(),multiline, 'notes survive reload');
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    const longNote = 'X'.repeat(400) + '\n' + Array.from({length:60},(_,i)=>`Línea sintética ${i+1}: prueba de lectura y desplazamiento.`).join('\n');
    await page.locator('textarea').fill(longNote);
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await region.waitFor();
    await page.waitForFunction(text => document.querySelector('[role=region]')?.textContent === text, longNote);
    assert.equal(await region.textContent(),longNote);
    const metrics = await region.evaluate(e=>({
      h:e.clientHeight, sh:e.scrollHeight, w:e.clientWidth, sw:e.scrollWidth,
      body:document.documentElement.scrollWidth, viewport:innerWidth,
      header:document.querySelector('header').getBoundingClientRect().height,
      wrap:getComputedStyle(e).overflowWrap,
    }));
    assert(metrics.h <= 128 && metrics.sh > metrics.h, 'long note has bounded vertical scrolling');
    assert(metrics.sw <= metrics.w + 1 && metrics.body <= metrics.viewport, 'no horizontal overflow');
    assert(metrics.header < 150, 'note does not grow sticky header');
    assert.equal(metrics.wrap,'anywhere');
    await region.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(()=>{const e=document.querySelector('[role=region]');return e.scrollTop+e.clientHeight>=e.scrollHeight-1;});
    await page.screenshot({path:`${output}/${viewport.width}-long-note-end.png`});
    await region.evaluate(e=>e.scrollTo({top:0,behavior:'instant'}));
    await page.waitForFunction(()=>document.querySelector('[role=region]').scrollTop===0);
    await page.screenshot({path:`${output}/${viewport.width}-long-note.png`});
    await page.getByRole('button',{name:'Nuevo registro',exact:true}).click();
    await page.locator('input[type=date]').fill('2026-01-02');
    await page.locator('textarea').fill('');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await region.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Fecha anterior'}).click();
    await region.waitFor();
    await page.waitForFunction(text => document.querySelector('[role=region]')?.textContent === text, longNote);
    assert.equal(await region.textContent(),longNote);
    assert.equal(await region.evaluate(e=>e.scrollTop),0,'note scroll position resets on date change');
    await page.getByRole('button',{name:'Fecha siguiente'}).click();
    await region.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    await page.locator('textarea').fill('Nota editada');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await region.waitFor();
    await page.waitForFunction(() => document.querySelector('[role=region]')?.textContent === 'Nota editada');
    assert.equal(await region.textContent(),'Nota editada');
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    await page.locator('textarea').fill('   \n   ');
    await page.getByRole('button',{name:'Guardar',exact:true}).click();
    await region.waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    results.push({viewport,metrics,passed:true});
    await context.close();
  }
  console.log(JSON.stringify({passed:true,results,screenshots:output},null,2));
} finally { await browser.close(); }
