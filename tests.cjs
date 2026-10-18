'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const N=require('./app.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('OK',name);}
function near(a,b,eps=1e-8){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}
const base=N.targets(N.DEFAULTS);
test('Цели по БЖУ сохраняют энергию',()=>{near(4*base.p+9*base.f+4*base.c,base.kcal);});
test('Все блюда имеют положительные конечные плотности',()=>{
 for(const list of Object.values(N.foods))for(const f of list){assert.ok(f.kcal>0&&Number.isFinite(f.kcal));near(f.kcal,4*f.p+9*f.f+4*f.c);}
});
test('Пустые и некорректные значения отклоняются, без подстановки нормы',()=>{
 for(const v of ['', '  ',0,-1,NaN,Infinity,null,undefined,'not-a-number',false,[],{}])
   assert.throws(()=>N.targets({...N.DEFAULTS,energy:v}));
});
test('Границы диапазона энергии проверяются',()=>{for(const energy of [599,8001])assert.throws(()=>N.targets({...N.DEFAULTS,energy}));for(const energy of [600,8000])assert.equal(N.targets({...N.DEFAULTS,energy}).kcal,energy);});
test('Сумма долей и каждая доля проверяются',()=>{
 for(const patch of [{proteinPct:0},{fatPct:-5},{carbPct:99},{proteinPct:40},{proteinPct:''}])assert.throws(()=>N.targets({...N.DEFAULTS,...patch}));
 assert.doesNotThrow(()=>N.targets({...N.DEFAULTS,proteinPct:25.1,fatPct:29.9}));
});
test('Взрослая формула не принимает детский и выходящий за пределы выборки возраст',()=>{
 for(const age of [10,15,18,79,999,30.5,''])assert.throws(()=>N.targets({...N.DEFAULTS,mode:'adult',age}));
 for(const age of [19,78])assert.doesNotThrow(()=>N.targets({...N.DEFAULTS,mode:'adult',age}));
});
test('Независимый эталон взрослой формулы и сценариев',()=>{
 const raw={...N.DEFAULTS,mode:'adult',age:30,height:168,weight:58,gender:'male',activity:1.55};
 const resting=10*58+6.25*168-5*30+5;
 near(N.targets(raw).resting,resting);assert.equal(N.targets(raw).kcal,Math.round(resting*1.55));
 assert.equal(N.targets({...raw,goal:'deficit'}).kcal,Math.round(resting*1.55*.85));
 assert.equal(N.targets({...raw,goal:'surplus'}).kcal,Math.round(resting*1.55*1.15));
});
test('Вес, рост, пол и коэффициент проверяются',()=>{
 for(const patch of [{weight:-58},{weight:0},{height:0},{gender:'other'},{activity:1.4},{goal:'unknown'}])assert.throws(()=>N.targets({...N.DEFAULTS,mode:'adult',...patch}));
});
test('Границы порций и допуск проверяются',()=>{
 for(const patch of [{minPct:0},{maxPct:201},{maxPct:99},{tolerance:0},{tolerance:26}])assert.throws(()=>N.targets({...N.DEFAULTS,...patch}));
});
test('Фактические калории считаются по массе, а не подставляются из цели',()=>{
 const f=N.foods.breakfast[0],q=N.portion(f,310);near(q.kcal,f.kcal*3.1);near(q.kcal,4*q.p+9*q.f+4*q.c);
 assert.throws(()=>N.portion(f,0));assert.throws(()=>N.portion(f,NaN));
});
test('Рассмотрены все 625 сочетаний блюд',()=>{assert.equal(N.candidates(base).length,625);});
test('При фиксированных порциях лучший вариант совпадает с полным независимым перебором',()=>{
 const t=N.targets({...N.DEFAULTS,minPct:100,maxPct:100});let best=Infinity;
 for(const b of N.foods.breakfast)for(const l of N.foods.lunch)for(const s of N.foods.snack)for(const d of N.foods.dinner){
   const fs=[b,l,s,d];const sums={kcal:0,p:0,f:0,c:0};
   fs.forEach(f=>{for(const k of Object.keys(sums))sums[k]+=f[k]*f.baseGrams/100;});
   const q=4*((sums.kcal-t.kcal)/t.kcal)**2+['p','f','c'].reduce((a,k)=>a+((sums[k]-t[k])/t[k])**2,0)+
    .2*fs.reduce((a,f,i)=>a+(f.kcal*f.baseGrams/100/t.kcal-N.MEALS[i].share)**2,0);
   best=Math.min(best,q);
 }
 near(N.candidates(t)[0].score,best);
});
test('Инварианты плана на 30 разных сценариях',()=>{
 for(const energy of [600,1200,2000,2400,5000,8000])for(const ratios of [[25,30,45],[20,25,55],[30,30,40],[10,10,80],[80,10,10]]){
   const t=N.targets({...N.DEFAULTS,energy,proteinPct:ratios[0],fatPct:ratios[1],carbPct:ratios[2]});const plan=N.plan(t);
   assert.equal(plan.days.length,7);
   for(const day of plan.days){
     const sum={kcal:0,p:0,f:0,c:0};day.items.forEach((item,i)=>{
       const f=N.foods[N.MEALS[i].key].find(f=>f.id===item.id),lim=N.bounds(f,t.input);
       assert.ok(Number.isFinite(item.grams)&&item.grams>=lim.min&&item.grams<=lim.max);assert.equal(item.grams%10,0);
       for(const k of Object.keys(sum)){near(item[k],f[k]*item.grams/100);sum[k]+=item[k];}
     });
     for(const k of Object.keys(sum)){near(sum[k],day.totals[k]);near(day.errors[k],(sum[k]-t[k])/t[k]);}
     near(day.totals.kcal,4*day.totals.p+9*day.totals.f+4*day.totals.c);
     assert.equal(day.meets,Object.keys(sum).every(k=>Math.abs((sum[k]-t[k])/t[k])<=.1+1e-12));
   }
 }
});
test('Недостижимая высокая цель не создаёт неограниченные порции',()=>{
 const p=N.plan(N.targets({...N.DEFAULTS,energy:8000}));assert.equal(p.foundAcceptable,0);assert.ok(p.days.every(d=>!d.meets));
});
test('План воспроизводим и не меняет входные данные',()=>{
 const raw=JSON.stringify(base);assert.deepEqual(N.plan(base),N.plan(base));assert.equal(JSON.stringify(base),raw);
});
const saved=N.plan(base);
test('Восстановленный план пересчитывает факты, а не доверяет сохранённым цифрам',()=>{
 const corrupt=JSON.parse(JSON.stringify(saved));corrupt.days[0].totals.kcal=-1;corrupt.days[0].items[0].p=999;
 const restored=N.validateSaved(corrupt);assert.ok(restored);near(restored.days[0].totals.kcal,saved.days[0].totals.kcal);near(restored.days[0].items[0].p,saved.days[0].items[0].p);
});
test('Повреждённое хранилище и неверные порции отклоняются',()=>{
 assert.equal(N.validateSaved(null),null);assert.equal(N.validateSaved({}),null);
 for(const patch of [x=>x.version='old',x=>x.days[0].items[0].grams=99999,x=>x.days[0].items[0].id='<script>',x=>x.days[0]=null,x=>x.days[0].items[0].grams=101]){
   const x=JSON.parse(JSON.stringify(saved));patch(x);assert.equal(N.validateSaved(x),null);
 }
});

// Имитация DOM проверяет обработчики и состояние; не заменяет визуальный браузерный тест.
function dom(storageFails=false){
 const html=fs.readFileSync(__dirname+'/index.html','utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'duplicate IDs');
 class Element{constructor(){this.children=[];this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.attrs={};this.textContent='';}
   append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attrs[k]=v;}
   addEventListener(k,f){this.listeners[k]=f;}focus(){}remove(){}click(){this.trigger('click');}
   trigger(k){if(this.listeners[k])this.listeners[k]({preventDefault(){}});}
 }
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()])),saved=new Map(),queue=[];
 const storage={getItem(k){if(storageFails)throw Error();return saved.get(k)??null;},setItem(k,v){if(storageFails)throw Error();saved.set(k,v);},removeItem(k){if(storageFails)throw Error();saved.delete(k);}};
 const document={readyState:'complete',getElementById:id=>elements[id]??null,createElement:()=>new Element(),body:new Element()};
 const sandbox={document,localStorage:storage,setTimeout:f=>queue.push(f),window:{print(){}},console};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),sandbox);
 return {elements,saved,flush(){while(queue.length)queue.shift()();}};
}
test('Начальный экран и создание плана работают без внешних библиотек',()=>{
 const d=dom();d.elements['calc-form'].trigger('submit');d.flush();assert.equal(d.elements.result.hidden,false);assert.equal(d.saved.size,1);
});
test('Переключение дня и недели сохраняет состав плана',()=>{
 const d=dom();d.elements['calc-form'].trigger('submit');d.flush();const before=[...d.saved.values()][0];
 d.elements['view-week'].trigger('click');assert.equal(d.elements.plans.children.length,7);
 d.elements['view-day'].trigger('click');assert.equal(d.elements.plans.children.length,1);assert.equal([...d.saved.values()][0],before);
});
test('Изменение параметров убирает устаревший результат и отключает экспорт',()=>{
 const d=dom();d.elements['calc-form'].trigger('submit');d.flush();d.elements.energy.value='8000';d.elements['calc-form'].trigger('input');
 assert.equal(d.elements.result.hidden,true);assert.equal(d.elements.download.disabled,true);assert.equal(d.saved.size,0);
});
test('Незавершённый расчёт не публикует результат для изменённых полей',()=>{
 const d=dom();d.elements['calc-form'].trigger('submit');d.elements.energy.value='';d.elements['calc-form'].trigger('input');d.flush();assert.equal(d.saved.size,0);assert.equal(d.elements.result.hidden,true);
});
test('Недопустимый ввод показывает ошибку',()=>{
 const d=dom();d.elements.energy.value='';d.elements['calc-form'].trigger('submit');assert.equal(d.elements['form-error'].hidden,false);assert.ok(d.elements['form-error'].textContent.includes('Заполните'));assert.equal(d.saved.size,0);
});
test('Отказ localStorage не останавливает расчёт',()=>{
 const d=dom(true);d.elements['calc-form'].trigger('submit');d.flush();assert.equal(d.elements.result.hidden,false);assert.ok(d.elements['storage-note'].textContent.includes('недоступно'));
});
test('Нет случайного выбора и обязательных CDN-зависимостей',()=>{
 const html=fs.readFileSync(__dirname+'/index.html','utf8'),js=fs.readFileSync(__dirname+'/app.js','utf8'),css=fs.readFileSync(__dirname+'/styles.css','utf8');
 assert.ok(!/<script[^>]+src="https?:/i.test(html));assert.ok(!/@import/.test(css));assert.ok(!/Math\.random|fetch\(|XMLHttpRequest/.test(js));
});
console.log(`\nПроверок пройдено: ${passed}. Визуальная проверка браузера в эту команду не входит.`);
