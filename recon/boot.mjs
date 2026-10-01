import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR', e.message));
p.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(2500);
console.log('booted:', await p.evaluate(() => !!window.__craft));
await b.close();
