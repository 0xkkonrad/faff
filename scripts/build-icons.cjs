const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const svg = fs.readFileSync(path.join(__dirname,'../web/logo.svg'),'utf8');
    for (const [name,size,padding] of [['icon-192',192,.1],['icon-512',512,.1],['maskable-512',512,.2],['apple-touch-icon',180,.1]]) {
      const data = await page.evaluate(async({svg,size,padding})=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f5ee';ctx.fillRect(0,0,size,size);
        const image=new Image(); image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
        ctx.drawImage(image,size*padding,size*padding,size*(1-2*padding),size*(1-2*padding));
        return canvas.toDataURL('image/png').split(',')[1];
      },{svg,size,padding});
      fs.writeFileSync(path.join(__dirname,`../web/icons/${name}.png`),Buffer.from(data,'base64'));
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
