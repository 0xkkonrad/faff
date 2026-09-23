const catalog = await fetch('./catalog.json').then(response => { if (!response.ok) throw new Error('Could not load logos'); return response.json(); });
const variants = catalog.flatMap(concept => concept.variants.map(variant => ({...variant, concept})));
const byId = id => variants.find(variant => variant.id === id);
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key,value) => { try { localStorage.setItem(key,value); } catch { /* The picker also works without saved preferences. */ } };
let saved; try { saved = new Set(JSON.parse(read('faff-brand-saved') || '[]').filter(id => byId(id))); } catch { saved = new Set(); }
let selected = byId(location.hash.slice(1)) || byId(read('faff-brand-choice')) || variants[0];
let filter = 'all';
const svg = (variant, attributes='') => `<svg viewBox="0 0 ${variant.width} 100" aria-hidden="true" ${attributes}>${variant.mark}</svg>`;
const announce = message => { document.querySelector('#status').textContent = message; };
function renderCards() {
  document.querySelector('#directions').innerHTML = catalog.map(concept => {
    const shown = concept.variants.filter(variant => filter === 'all' || saved.has(variant.id));
    if (!shown.length) return '';
    return `<section class="direction" aria-labelledby="direction-${concept.number}"><div class="direction-heading"><span class="direction-number">${concept.number} /</span><h2 id="direction-${concept.number}">${concept.name}</h2><p>${concept.text}</p></div><div class="cards">${shown.map(variant => `<article class="card"><button class="logo-button" data-choice="${variant.id}" aria-pressed="${selected.id === variant.id}" aria-label="Select ${variant.id}, ${concept.name}, ${variant.label}"><span class="card-art ${concept.wide?'wide':''}">${svg(variant)}${concept.wide?'':'<span class="card-word">faff</span>'}</span><span class="card-caption"><strong>${variant.id}</strong><span>${variant.label}</span></span></button><button class="save" data-save="${variant.id}" aria-pressed="${saved.has(variant.id)}" aria-label="${saved.has(variant.id)?'Unsave':'Save'} ${variant.id}">${saved.has(variant.id)?'★':'☆'}</button></article>`).join('')}</div></section>`;
  }).join('');
  document.querySelector('#saved-count').textContent = saved.size;
  document.querySelector('#empty').hidden = filter !== 'saved' || saved.size > 0;
}
function select(variant) {
  selected = variant;
  write('faff-brand-choice',variant.id);
  history.replaceState(null,'',`#${variant.id}`);
  document.querySelector('#selected-art').innerHTML = svg(variant);
  document.querySelector('#selected-id').textContent = `SELECTED / ${variant.id}`;
  document.querySelector('#selected-name').textContent = `${variant.concept.name} · ${variant.label}`;
  document.querySelector('#selected-description').textContent = variant.concept.text;
  const download = document.querySelector('#download');
  download.href = variant.file; download.download = `faff-${variant.id}.svg`;
  document.querySelector('#sizes').innerHTML = [16,32,64].map(size => svg(variant,`style="width:${size}px;height:${size}px"`)).join('');
  document.querySelectorAll('[data-choice]').forEach(button => button.setAttribute('aria-pressed',button.dataset.choice === variant.id));
  announce(`Selected ${variant.id}, ${variant.concept.name}, ${variant.label}`);
}
document.querySelector('#directions').addEventListener('click',event=>{
  const choice = event.target.closest('[data-choice]');
  if (choice) select(byId(choice.dataset.choice));
  const save = event.target.closest('[data-save]');
  if (save) {
    const id = save.dataset.save;
    saved.has(id) ? saved.delete(id) : saved.add(id);
    write('faff-brand-saved',JSON.stringify([...saved]));
    renderCards();
    document.querySelector(`[data-save="${id}"]`)?.focus();
    announce(`${id} ${saved.has(id)?'saved':'removed from favourites'}`);
  }
});
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  filter=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',item===button);});
  renderCards();
}));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  document.body.dataset.mode=button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',item===button);});
}));
document.querySelector('#copy').addEventListener('click',async()=>{
  const choice=`Faff ${selected.id} — ${selected.concept.name}, ${selected.label}`;
  try { await navigator.clipboard.writeText(choice); document.querySelector('#copy').textContent='Copied ✓'; setTimeout(()=>document.querySelector('#copy').textContent='Copy choice',2000); }
  catch { announce(choice); document.querySelector('#copy').textContent=selected.id; }
});
const dialog = document.querySelector('#preview-dialog');
document.querySelector('#preview').addEventListener('click',()=>{
  document.querySelector('#preview-title').textContent=`${selected.id} · ${selected.concept.name}`;
  document.querySelector('#phone-brand').innerHTML=svg(selected,selected.concept.wide?'class="wide"':'')+(selected.concept.wide?'':'<span>faff</span>');
  dialog.showModal();
});
document.querySelector('#close-preview').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
window.addEventListener('hashchange',()=>{const next=byId(location.hash.slice(1));if(next)select(next);});
renderCards(); select(selected);
