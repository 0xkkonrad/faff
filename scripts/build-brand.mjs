import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../web/brand');
const stroke = (d, w=5) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (x,y,r,fill='currentColor') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const face = (v=0) => circle(42,49,2.1)+circle(59,49,2.1)+stroke(['M44 61Q51 67 58 59','M45 61h11','M45 61q6 5 12 0','M45 61q6-4 12 0','M44 60q7 8 14 0'][v],2.7);
const f = 'M46 78V34Q46 17 62 23M34 43H62';
const word = stroke('M12 69V34Q12 18 27 24M4 42H28M62 47C61 31 36 34 36 53C36 71 61 73 62 53V69M84 69V34Q84 18 99 24M75 42H100M119 69V34Q119 18 134 24M110 42H137',7);
const concepts = [
 {name:'Loose end', text:'A little loop, then back to it. A lowercase f drawn in one wandering line.', labels:['The loop','Long way round','Little flourish','Open loop','Back on track'], marks:[
 stroke('M44 80V32C44 12 72 15 65 32C60 43 29 33 27 47C24 62 61 46 65 61C69 77 48 77 44 67'),
 stroke('M42 80V33C42 13 69 14 67 29C65 42 35 34 30 45C24 59 58 49 65 62C71 74 59 84 49 77'),
 stroke('M42 80V32C42 12 72 15 65 31C58 43 24 37 28 50C33 61 61 44 66 58C71 71 55 79 47 70')+stroke('M68 44l9-5',3),
 stroke('M43 80V31C43 15 65 13 68 26M28 46C40 38 67 38 68 51C69 68 44 59 45 71C45 79 58 82 68 72'),
 stroke('M42 80V33C42 12 69 15 67 30C64 44 27 32 27 48C27 61 67 45 67 62C67 73 54 76 48 69')+circle(76,76,3)
 ]},
 {name:'Good company', text:'Two f’s share a crossbar. A compact monogram with a friendly rhythm.', labels:['Together','Side by side','Joined up','Leaning in','Mirror pair'], marks:[
 stroke('M30 76V32Q30 17 45 22M56 76V32Q56 17 71 22M19 43H72',7),
 stroke('M28 77V38Q28 20 44 25M57 77V27Q57 12 73 17M18 46H73',6),
 stroke('M27 77V32Q27 15 45 22M57 77V32Q57 15 75 22M18 43H70Q79 43 79 52',6),
 `<g transform="skewX(-9) translate(8 0)">${stroke('M30 76V32Q30 17 45 22M57 76V32Q57 17 72 22M20 43H73',8)}</g>`,
 stroke('M34 77V32Q34 17 49 23M66 77V32Q66 17 51 23M19 44H81',6)
 ]},
 {name:'Scenic route', text:'A wandering path with a clear destination. Less guilt about the detour.', labels:['One detour','Round trip','Meander','Orbit','Almost there'], marks:[
 stroke('M21 74V31Q21 20 34 20H65Q81 20 81 36Q81 52 64 52H47Q31 52 31 66Q31 79 46 79H62',5)+circle(78,79,5),
 stroke('M24 73C5 44 31 12 58 21C84 28 87 60 70 74C55 87 31 72 42 57C51 45 69 57 63 67',5)+circle(23,75,5),
 stroke('M18 70C17 47 35 25 45 32C60 42 27 67 43 73C61 80 76 45 80 23',5)+circle(80,23,5),
 stroke('M75 28C49 3 9 35 25 66C41 94 86 68 71 44C62 27 42 34 40 48',5)+circle(40,48,5),
 stroke('M19 76V35Q19 20 33 20Q47 20 47 34V65Q47 80 62 80Q77 80 77 65V29',5)+circle(77,18,5)
 ]},
 {name:'Daydream', text:'A small cloud for the moments your mind goes somewhere else.', labels:['Passing cloud','Head in clouds','Drifting','Cloud f','Rain check'], marks:[
 stroke('M24 70C6 64 12 43 27 42C25 19 57 16 63 35C87 25 97 64 76 70Z',4)+face(0),
 stroke('M20 70C3 58 16 38 30 42C25 19 51 13 61 33C78 23 91 41 82 53C100 64 77 82 65 73Z',4)+face(1),
 stroke('M23 68C7 64 11 41 30 43C27 22 54 18 61 38C83 26 98 59 78 68Z',4)+stroke('M27 81h25M58 81h11',3)+face(2),
 stroke('M24 71C8 64 14 44 29 44C25 23 56 17 62 36C84 25 96 65 77 71Z',4)+`<g transform="translate(22 19) scale(.55)">${stroke(f,5)}</g>`,
 stroke('M23 61C8 54 17 35 30 36C28 16 57 13 62 30C82 23 94 54 76 61Z',4)+stroke('M34 74l-4 8M52 73l-4 8M70 74l-4 8',4)
 ]},
 {name:'Little faffer', text:'An unhurried companion. Soft, odd, and happy to start again.', labels:['The bean','Flop','Pebble','Puddle','Stretch'], marks:[
 stroke('M26 72C10 59 20 26 40 23C58 12 70 27 72 39C94 55 80 80 61 78C45 89 30 82 26 72Z',4)+face(0),
 stroke('M22 73C11 61 21 38 25 29C33 10 50 21 51 35C69 14 87 26 78 47C97 67 70 84 56 78C42 88 25 84 22 73Z',4)+face(1),
 stroke('M20 62C18 37 34 18 54 21C77 24 86 52 77 71C69 90 23 87 20 62Z',4)+face(2),
 stroke('M14 70C14 54 31 56 32 40C34 19 58 14 68 34C78 53 77 48 87 63C104 86 65 88 49 81C32 90 11 84 14 70Z',4)+face(3),
 stroke('M29 78C19 63 30 58 26 41C20 19 39 9 50 22C65 7 82 21 74 41C69 58 88 77 70 84C54 90 40 87 29 78Z',4)+face(4)
 ]},
 {name:'Give it time', text:'A slightly wonky clock. Thirty minutes, with room to be human.', labels:['Off centre','Half hour','Time out','Soft square','Wind down'], marks:[
 stroke('M76 26C91 43 82 76 62 81C34 91 13 64 20 42C25 19 55 11 76 26Z',4)+stroke('M51 31v23l15 8',5),
 stroke('M50 18A32 32 0 1 0 82 50',4)+stroke('M50 18V50H82',4)+circle(50,50,4),
 stroke('M72 23A33 33 0 1 0 82 46',4)+stroke('M44 38v26M59 38v26',5)+circle(81,26,4),
 stroke('M30 20Q15 21 18 38L21 70Q22 84 39 82L72 78Q86 76 82 59L78 29Q77 16 60 18Z',4)+stroke('M49 32v21l15 9',5),
 stroke('M77 25C45 8 16 25 18 55C21 85 63 88 77 64C92 36 54 23 40 39C28 52 45 70 57 61',4)+circle(57,61,4)
 ]},
 {name:'Paper plans', text:'A folded note becomes an f. A small plan you can actually keep.', labels:['Fold','Dog ear','Little flag','Turn the page','Folded f'], marks:[
 stroke('M30 79V21H61L77 37H49V48H66V63H49V79Z',4)+stroke('M61 21v16',3),
 stroke('M25 79V20H62L77 36V79ZM62 20V37H77',4)+stroke('M43 65V43H61M43 54H56',4),
 stroke('M30 82V20L77 28L69 56L31 49M32 35L70 42',4),
 stroke('M27 78V24Q47 16 69 24V71Q47 63 27 78M69 24L79 30V80Q52 72 27 83',4)+stroke('M42 59V34H57M42 45H55',3),
 `<path d="M25 80V20H76L62 35H43V45H66L52 60H43V80Z" fill="currentColor"/><path d="M62 20v15h14" fill="none" stroke="currentColor" stroke-width="3"/>`
 ]},
 {name:'Pause bloom', text:'A pause at the centre of a flower. Rest belongs in the day, too.', labels:['Four petals','Six petals','Daisy','Slow sun','Clover'], marks:[0,1,2,3,4].map(v=>{
 const n=[4,6,8,10,3][v]; let petals='';
 for(let i=0;i<n;i++) petals+=`<ellipse cx="50" cy="29" rx="${[14,10,7,4,16][v]}" ry="${[19,16,16,13,21][v]}" transform="rotate(${i*360/n} 50 50)" fill="none" stroke="currentColor" stroke-width="${v===3?3:3.5}"/>`;
 return petals+circle(50,50,18,'var(--paper, #f7f5ee)')+stroke('M44 43v14M56 43v14',4);
 })},
 {name:'On a tangent', text:'Bold f shapes that take one unexpected turn. Built to work at icon size.', labels:['Cut corner','Round the bend','Offset','Side step','Solid loop'], marks:[
 '<path d="M27 80V20H78L64 35H44V45H68L54 60H44V80Z" fill="currentColor"/>',
 '<path d="M27 80V37Q27 17 49 17H75V34H49Q44 34 44 40V45H68V61H44V80Z" fill="currentColor"/>',
 '<path d="M25 80V39H42V80ZM25 19H77V35H25ZM45 44H68V60H45Z" fill="currentColor"/>',
 '<path d="M25 80V20H77V35H43V45H66V61H43V80Z" fill="currentColor"/><path d="M65 63H80V79H65Z" fill="currentColor"/>',
 '<path fill-rule="evenodd" d="M24 81V38Q24 16 48 16H58Q79 16 79 35Q79 54 57 54H42V81ZM42 39H58Q63 39 63 35Q63 31 57 31H49Q42 31 42 39Z" fill="currentColor"/>'
 ]},
 {name:'Just faff', text:'Let the name do the work. Five drawn wordmarks, with no extra symbol.', labels:['Easygoing','Forward','Bouncy','Underlined','A little smile'], wide:true, marks:[
 word,
 `<g transform="translate(8 0) skewX(-9)">${word}</g>`,
 stroke('M13 71V35Q13 19 27 25M5 44H28M62 51C60 35 36 38 36 56C36 74 61 76 62 56V73M84 67V32Q84 16 99 22M76 40H100M119 72V37Q119 21 134 27M111 46H137',7),
 word+stroke('M8 86Q67 92 134 82',3),
 word+stroke('M62 82q21 15 41-1',3)
 ]}
];
fs.mkdirSync(path.join(root,'logos'),{recursive:true});
const catalog=[];
for(const [i,concept] of concepts.entries()) {
 const number=String(i+1).padStart(2,'0');
 const variants=concept.marks.map((mark,j)=>{
  const id=number+String.fromCharCode(65+j), width=concept.wide?146:100;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 100" style="color:#252a26;--paper:#f7f5ee" role="img" aria-label="Faff ${concept.name}, ${concept.labels[j]}"><title>Faff ${id} — ${concept.labels[j]}</title>${mark}</svg>\n`;
  fs.writeFileSync(path.join(root,`logos/faff-${id}.svg`),svg);
  return {id,label:concept.labels[j],file:`logos/faff-${id}.svg`,width,mark};
 });
 catalog.push({number,name:concept.name,text:concept.text,wide:!!concept.wide,variants});
}
fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.resolve(root,'../logo.svg'),fs.readFileSync(path.join(root,'logos/faff-01A.svg')));
fs.writeFileSync(path.resolve(root,'../icon.svg'),fs.readFileSync(path.join(root,'logos/faff-01A.svg')));
console.log(`Wrote ${catalog.length} directions and ${catalog.flatMap(c=>c.variants).length} SVG logos.`);
