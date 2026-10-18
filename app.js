/* NutriCalc Pro 2.0.0. Исправленная версия с помощью ИИ.
 * Исходный проект: Георгий Образцов. Модель предназначена для исследования,
 * данные блюд перенесены из исходного проекта и не являются проверенными рецептурами.
 * Без сетевых запросов и внешних библиотек. CommonJS экспорт для независимых тестов.
 */
(function (root) {
  'use strict';
  const VERSION = '2.0.0';
  const KEYS = ['kcal', 'p', 'f', 'c'];
  const MEALS = [
    {key:'breakfast', title:'Завтрак', share:.25},
    {key:'lunch', title:'Обед', share:.35},
    {key:'snack', title:'Перекус', share:.15},
    {key:'dinner', title:'Ужин', share:.25}
  ];
  const DAYS = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const DATA = {
    breakfast: [
      ['b1','Овсяная каша на молоке с яблоком и корицей',4,3.5,18,250],
      ['b2','Овсяноблин с сыром, зеленью и варёным яйцом',8,7,12,200],
      ['b3','Творожная запеканка с изюмом и сметаной',12,5,16,200],
      ['b4','Гречневая каша с яйцом пашот и авокадо',6,6,20,220],
      ['b5','Скрембл на цельнозерновом тосте',10,9,15,180]
    ],
    lunch: [
      ['l1','Запечённое куриное филе, гречка и салат из огурцов',14,3,16,350],
      ['l2','Гуляш из индейки, бурый рис и тушёные кабачки',12,4,18,360],
      ['l3','Суп-крем из брокколи с сухариками и запечённый лосось',9,7,12,380],
      ['l4','Тушёная телятина, булгур и свежие томаты',13,5,17,350],
      ['l5','Запечённый минтай, киноа и запечённая тыква',11,3,15,340]
    ],
    snack: [
      ['s1','Творог с яблоком и грецкими орехами',11,5,10,170],
      ['s2','Греческий йогурт с миндалём',7,8,6,160],
      ['s3','Печёное яблоко с корицей, мёдом и кешью',2,6,18,180],
      ['s4','Сэндвич из цельнозернового хлеба с индейкой',10,3,16,130],
      ['s5','Фруктовый салат с семенами тыквы',3,4,20,180]
    ],
    dinner: [
      ['d1','Треска на пару с брокколи и цветной капустой',12,2,6,300],
      ['d2','Индейка на гриле с овощным рагу',13,3,8,320],
      ['d3','Салат с тунцом, яйцом, черри и шпинатом',11,5,4,280],
      ['d4','Запечённый судак с салатом и оливковым маслом',12,4,5,300],
      ['d5','Творожная паста с зеленью и огурцом на тосте',10,4,10,220]
    ]
  };
  const foods = {};
  for (const meal of MEALS) foods[meal.key] = DATA[meal.key].map(([id,name,p,f,c,baseGrams]) =>
    Object.freeze({id,name,p,f,c,baseGrams,kcal:4*p+9*f+4*c}));
  const ALL = Object.values(foods).flat();
  const DEFAULTS = Object.freeze({mode:'manual', energy:2400, proteinPct:25, fatPct:30, carbPct:45,
    age:30, height:168, weight:58, gender:'male', activity:1.55, goal:'maintain',
    minPct:50, maxPct:150, tolerance:10});

  function number(value, label, min, max) {
    if (value === null || value === undefined || (typeof value==='string' && value.trim()==='') ||
        !['number','string'].includes(typeof value)) throw new Error(`Заполните поле «${label}».`);
    const n=Number(value);
    if (!Number.isFinite(n) || n<min || n>max)
      throw new Error(`«${label}»: введите число от ${min} до ${max}.`);
    return n;
  }
  function validate(raw) {
    if (!raw || !['manual','adult'].includes(raw.mode)) throw new Error('Выберите режим расчёта.');
    const v={mode:raw.mode};
    v.proteinPct=number(raw.proteinPct,'Белки, %',1,98);
    v.fatPct=number(raw.fatPct,'Жиры, %',1,98);
    v.carbPct=number(raw.carbPct,'Углеводы, %',1,98);
    if (Math.abs(v.proteinPct+v.fatPct+v.carbPct-100)>1e-6) throw new Error('Сумма долей БЖУ должна равняться 100%.');
    v.minPct=number(raw.minPct,'Минимальная порция, %',25,100);
    v.maxPct=number(raw.maxPct,'Максимальная порция, %',100,200);
    v.tolerance=number(raw.tolerance,'Допуск, %',1,25);
    if(raw.mode==='adult') {
      v.age=number(raw.age,'Возраст',19,78);
      if (!Number.isInteger(v.age)) throw new Error('Возраст укажите целым числом лет.');
      v.height=number(raw.height,'Рост, см',100,230);
      v.weight=number(raw.weight,'Вес, кг',30,250);
      if(!['male','female'].includes(raw.gender)) throw new Error('Выберите пол для формулы.');
      v.gender=raw.gender;
      v.activity=number(raw.activity,'Коэффициент активности',1.2,1.9);
      if(![1.2,1.375,1.55,1.725,1.9].includes(v.activity)) throw new Error('Выберите коэффициент активности из списка.');
      if(!['maintain','deficit','surplus'].includes(raw.goal)) throw new Error('Выберите сценарий расчёта.');
      v.goal=raw.goal;
    } else v.energy=number(raw.energy,'Энергетическая цель, ккал',600,8000);
    return v;
  }
  function targets(raw) {
    const input=validate(raw);
    let resting=null, energy=input.energy;
    if(input.mode==='adult') {
      resting=10*input.weight+6.25*input.height-5*input.age+(input.gender==='male'?5:-161);
      const factor=input.goal==='deficit'?.85:input.goal==='surplus'?1.15:1;
      energy=Math.round(resting*input.activity*factor);
      if(!Number.isFinite(energy)||energy<600||energy>8000)
        throw new Error('Оценка выходит за рабочий диапазон модели (600–8000 ккал). Проверьте параметры.');
    }
    return {input,resting, kcal:energy,p:energy*input.proteinPct/400,
      f:energy*input.fatPct/900,c:energy*input.carbPct/400};
  }
  function bounds(food,input) {
    const min=Math.ceil(food.baseGrams*input.minPct/100/10)*10;
    const max=Math.floor(food.baseGrams*input.maxPct/100/10)*10;
    if(min>max) throw new Error('Для выбранных ограничений нет порции с шагом 10 г.');
    return {min,max};
  }
  function portion(food,grams) {
    if(!food||!Number.isFinite(grams)||grams<=0) throw new Error('Некорректная порция.');
    return {id:food.id,grams,kcal:food.kcal*grams/100,p:food.p*grams/100,f:food.f*grams/100,c:food.c*grams/100};
  }
  function total(items) { return items.reduce((a,x)=>{for(const k of KEYS)a[k]+=x[k];return a;},{kcal:0,p:0,f:0,c:0}); }
  function errors(sum,t) {return Object.fromEntries(KEYS.map(k=>[k,(sum[k]-t[k])/t[k]]));}
  // Q = 4*eE² + eP² + eF² + eC² + 0.2*Σ (Emeal/Egoal - share)².
  function score(items,t) {
    const e=errors(total(items),t);
    return 4*e.kcal**2+e.p**2+e.f**2+e.c**2+
      .2*items.reduce((a,x,i)=>a+(x.kcal/t.kcal-MEALS[i].share)**2,0);
  }
  function solveCombination(combo,t) {
    const limits=combo.map(f=>bounds(f,t.input));
    const clamp=(n,i)=>Math.max(limits[i].min,Math.min(limits[i].max,n));
    const grams=combo.map((f,i)=>clamp(Math.round(t.kcal*MEALS[i].share/f.kcal*10)*10,i));
    let items=combo.map((f,i)=>portion(f,grams[i]));
    // Координатный поиск на сетке 10 г. Оптимум по всем размерам порций не гарантируется.
    for(let pass=0;pass<12;pass++) {
      let changed=false;
      for(let i=0;i<4;i++) {
        const rest=total(items.filter((_,j)=>j!==i));
        let aa=0, ab=0;
        for(const k of KEYS) {
          const a=combo[i][k]/100/t[k], b=(rest[k]-t[k])/t[k], w=k==='kcal'?4:1;
          aa+=w*a*a;ab+=w*a*b;
        }
        const a=combo[i].kcal/100/t.kcal;
        aa+=.2*a*a;ab+=.2*a*(-MEALS[i].share);
        const optimum=-ab/aa;
        const choices=[grams[i],clamp(Math.floor(optimum/10)*10,i),clamp(Math.ceil(optimum/10)*10,i)];
        let bestScore=score(items,t), bestGrams=grams[i];
        for(const g of choices) {
          const candidate=items.slice();candidate[i]=portion(combo[i],g);
          const s=score(candidate,t);
          if(s<bestScore-1e-12){bestScore=s;bestGrams=g;}
        }
        if(bestGrams!==grams[i]){grams[i]=bestGrams;items[i]=portion(combo[i],bestGrams);changed=true;}
      }
      if(!changed)break;
    }
    const sum=total(items), deviation=errors(sum,t);
    return {items,totals:sum,errors:deviation,score:score(items,t),
      meets:KEYS.every(k=>Math.abs(deviation[k])<=t.input.tolerance/100+1e-12)};
  }
  function candidates(t) {
    const out=[];
    for(const b of foods.breakfast)for(const l of foods.lunch)for(const s of foods.snack)for(const d of foods.dinner)
      out.push(solveCombination([b,l,s,d],t));
    out.sort((a,b)=>a.score-b.score||a.items.map(x=>x.id).join().localeCompare(b.items.map(x=>x.id).join()));
    return out;
  }
  function plan(t,revision=0) {
    const all=candidates(t), good=all.filter(x=>x.meets);
    const pool=(good.length?good:all).slice(0,40), counts={}, days=[];
    for(let day=0;day<7;day++) {
      const sorted=pool.map((x,i)=>({x,rank:i, cost:x.score+.003*x.items.reduce((s,f)=>s+(counts[f.id]||0),0)}))
        .sort((a,b)=>a.cost-b.cost||a.rank-b.rank);
      const pick=sorted[(revision+day)%Math.min(3,sorted.length)].x;
      const copy={...pick,items:pick.items.map(x=>({...x})),totals:{...pick.totals},errors:{...pick.errors}};
      days.push(copy);for(const x of pick.items)counts[x.id]=(counts[x.id]||0)+1;
    }
    return {version:VERSION,revision,targets:t,days,combinations:all.length,foundAcceptable:good.length,
      method:'625 сочетаний блюд; координатный поиск порций с шагом 10 г, до 12 проходов. Глобальная оптимальность не доказана.'};
  }
  function validateSaved(raw) {
    if(!raw||raw.version!==VERSION||!raw.targets||!Array.isArray(raw.days)||raw.days.length!==7) return null;
    try {
      const t=targets(raw.targets.input),days=[];
      for(const day of raw.days) {
        if(!day||!Array.isArray(day.items)||day.items.length!==4)return null;
        const items=[];
        for(let i=0;i<4;i++) {
          const x=day.items[i], f=foods[MEALS[i].key].find(f=>f.id===x.id);
          if(!f||!Number.isFinite(x.grams)||x.grams%10!==0)return null;
          const lim=bounds(f,t.input);if(x.grams<lim.min||x.grams>lim.max)return null;
          items.push(portion(f,x.grams));
        }
        const totals=total(items), deviation=errors(totals,t);
        days.push({items,totals,errors:deviation,score:score(items,t),meets:KEYS.every(k=>Math.abs(deviation[k])<=t.input.tolerance/100+1e-12)});
      }
      return {version:VERSION,revision:Number.isInteger(raw.revision)&&raw.revision>=0&&raw.revision<1e6?raw.revision:0,
        targets:t,days,combinations:625,foundAcceptable:candidates(t).filter(x=>x.meets).length,method:'Восстановленный план; показатели и число подходящих вариантов пересчитаны по базе версии 2.0.0.'};
    }catch{return null;}
  }
  const api={VERSION,MEALS,DAYS,foods,DEFAULTS,validate,targets,bounds,portion,total,errors,score,solveCombination,candidates,plan,validateSaved};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.NutriCalc=api;
  if(typeof document==='undefined')return;

  const $=id=>document.getElementById(id), STORE='nutricalc-pro-v2';
  let state=null, activeDay=0, view='day',dirty=false, generation=0;
  const fmt=(n,d=0)=>Number(n).toLocaleString('ru-RU',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=n=>`${n>=0?'+':''}${fmt(n*100,1)}%`;
  function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function read(){const out={};for(const key of Object.keys(DEFAULTS))out[key]=$(key).value;return out;}
  function write(v){for(const [key,val]of Object.entries({...DEFAULTS,...v}))if($(key))$(key).value=val;toggleMode();}
  function toggleMode(){const adult=$('mode').value==='adult';$('adult-fields').hidden=!adult;$('manual-fields').hidden=adult;
    for(const key of ['age','height','weight','gender','activity','goal'])$(key).disabled=!adult;
    $('energy').disabled=adult;}
  function message(text){$('form-error').textContent=text;$('form-error').hidden=!text;}
  function persist(){try{localStorage.setItem(STORE,JSON.stringify(state));$('storage-note').textContent='План сохранён только в этом браузере. В интернет данные не отправляются.';}catch{$('storage-note').textContent='Сохранение в браузере недоступно. Скачайте план, чтобы не потерять его.';}}
  function invalidate(){generation++;dirty=true;state=null;message('');$('result').hidden=true;$('empty-state').hidden=false;$('empty-state').textContent='Параметры изменены. Нажмите «Рассчитать и составить неделю».';
    $('regenerate').disabled=true;$('download').disabled=true;$('print').disabled=true;
    try{localStorage.removeItem(STORE);}catch{} }
  function generate(newVariant=false){
    message('');
    const ticket=++generation;
    try{
      const t=targets(read());
      const revision=newVariant&&state?state.revision+1:0;
      $('calculate').disabled=true;$('calculate').textContent='Расчёт…';
      // Отдаём браузеру кадр, затем выполняем ограниченный поиск.
      setTimeout(()=>{
        try {if(ticket!==generation)return;state=plan(t,revision);dirty=false;persist();render();$('result').focus();}
        catch(e){state=null;message(e.message);$('result').hidden=true;}
        finally{$('calculate').disabled=false;$('calculate').textContent='Рассчитать и составить неделю';}
      },0);
    }catch(e){state=null;$('result').hidden=true;$('empty-state').hidden=false;$('empty-state').textContent='Исправьте параметры и повторите расчёт.';
      for(const id of ['regenerate','download','print'])$(id).disabled=true;message(e.message);}
  }
  function totalsTable(day,t){
    const wrap=node('div','table-scroll'),table=node('table','totals');
    const head=node('thead'),hr=node('tr');for(const s of ['Показатель','Цель','Меню','Отклонение'])hr.append(node('th','',s));head.append(hr);table.append(head);
    const body=node('tbody');for(const [k,label,unit]of [['kcal','Энергия','ккал'],['p','Белки','г'],['f','Жиры','г'],['c','Углеводы','г']]){
      const tr=node('tr');tr.append(node('th','',label),node('td','',`${fmt(t[k],k==='kcal'?0:1)} ${unit}`),
        node('td','',`${fmt(day.totals[k],k==='kcal'?0:1)} ${unit}`),node('td',Math.abs(day.errors[k])<=t.input.tolerance/100+1e-12?'ok':'bad',pct(day.errors[k])));body.append(tr);
    }table.append(body);wrap.append(table);return wrap;
  }
  function renderDay(day,index,t){
    const card=node('article','day-card');card.append(node('h3','',DAYS[index]),node('p',day.meets?'status ok':'status bad',day.meets?
      `Все четыре показателя в допуске ±${fmt(t.input.tolerance)}%.`:
      `Цель не достигнута в допуске ±${fmt(t.input.tolerance)}%. Показан приближённый вариант.`));
    card.append(totalsTable(day,t));const grid=node('div','meal-grid');
    day.items.forEach((item,i)=>{const f=foods[MEALS[i].key].find(f=>f.id===item.id),lim=bounds(f,t.input),box=node('section','meal');
      box.append(node('h4','',MEALS[i].title),node('p','food-name',f.name),node('p','portion',`${fmt(item.grams)} г · ${fmt(item.kcal,1)} ккал`),
        node('p','muted',`Б ${fmt(item.p,1)} г · Ж ${fmt(item.f,1)} г · У ${fmt(item.c,1)} г`),
        node('p','small muted',`Допустимая порция: ${lim.min}–${lim.max} г. Базовая: ${f.baseGrams} г.`));grid.append(box);});card.append(grid);return card;
  }
  function render(){
    if(!state)return;const t=state.targets;
    $('result').hidden=false;$('empty-state').hidden=true;
    for(const id of ['regenerate','download','print'])$(id).disabled=false;
    $('estimate').textContent=t.resting===null?'Режим: заданная учебная цель.':`Оценка расхода в покое: ${fmt(t.resting,1)} ккал/сут. Результат формулы, без измерения обмена веществ.`;
    $('summary').textContent=`Цель: ${fmt(t.kcal)} ккал · Б ${fmt(t.p,1)} г · Ж ${fmt(t.f,1)} г · У ${fmt(t.c,1)} г`;
    $('search-info').textContent=state.foundAcceptable===null?state.method:
      `${state.method} В допуске: ${state.foundAcceptable} из ${state.combinations} найденных вариантов с уточнёнными порциями.`;
    $('regenerate').disabled=state.foundAcceptable===1;
    $('variant-info').textContent=state.foundAcceptable===1?'В допуск попал один найденный вариант: он повторяется на неделе. Для сравнения исследуйте другие границы порций или цели.':'';
    $('no-solution').hidden=state.days.every(d=>d.meets);
    $('no-solution').textContent='Найденные варианты не выполняют все цели одновременно. Это не доказательство отсутствия решения. Изучите отклонения, базу блюд и ограничения порций.';
    $('day-picker').hidden=view==='week';$('day-select').value=String(activeDay);
    $('view-day').setAttribute('aria-pressed',String(view==='day'));$('view-week').setAttribute('aria-pressed',String(view==='week'));
    const cont=$('plans');cont.replaceChildren();
    if(view==='week')state.days.forEach((d,i)=>cont.append(renderDay(d,i,t)));else cont.append(renderDay(state.days[activeDay],activeDay,t));
    $('print-mode').textContent=view==='week'?'План на неделю':DAYS[activeDay];
  }
  function renderDatabase(){
    const q=$('food-search').value.trim().toLocaleLowerCase('ru');const body=$('food-rows');body.replaceChildren();let count=0;
    for(const meal of MEALS)for(const f of foods[meal.key]){if(q&&!f.name.toLocaleLowerCase('ru').includes(q))continue;
      const tr=node('tr');for(const val of [meal.title,f.name,fmt(f.baseGrams),fmt(f.kcal,1),fmt(f.p,1),fmt(f.f,1),fmt(f.c,1)])tr.append(node('td','',val));body.append(tr);count++;}
    $('food-count').textContent=`Найдено блюд: ${count}`;
  }
  function init(){
    write(DEFAULTS);
    try{const saved=localStorage.getItem(STORE);if(saved){state=validateSaved(JSON.parse(saved));if(!state){localStorage.removeItem(STORE);$('storage-note').textContent='Сохранённый план повреждён или устарел. Выполните новый расчёт.';}else write(state.targets.input);}}catch{$('storage-note').textContent='Сохранённый план недоступен. Можно выполнить новый расчёт.';}
    $('calc-form').addEventListener('submit',e=>{e.preventDefault();generate();});
    $('calc-form').addEventListener('input',()=>{toggleMode();invalidate();});
    $('calc-form').addEventListener('change',()=>{toggleMode();invalidate();});
    $('regenerate').addEventListener('click',()=>generate(true));
    $('view-day').addEventListener('click',()=>{view='day';render();});
    $('view-week').addEventListener('click',()=>{view='week';render();});
    $('day-select').addEventListener('change',()=>{activeDay=Number($('day-select').value);render();});
    $('food-search').addEventListener('input',renderDatabase);
    $('print').addEventListener('click',()=>{if(state&&!dirty)window.print();});
    $('download').addEventListener('click',()=>{
      if(!state||dirty)return;
      const exportData={...state,notice:'Учебная модель. База блюд не верифицирована. Не персональное назначение питания.',
        days:state.days.map((d,i)=>({...d,day:DAYS[i],items:d.items.map((x,j)=>({...x,name:foods[MEALS[j].key].find(f=>f.id===x.id).name}))}))};
      const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');
      a.href=url;a.download='nutricalc-plan.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $('clear-storage').addEventListener('click',()=>{try{localStorage.removeItem(STORE);$('storage-note').textContent='Сохранённый план удалён из браузера. Текущий расчёт остаётся на экране.';}catch{$('storage-note').textContent='Хранилище браузера недоступно.';}});
    renderDatabase();if(state)render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof globalThis!=='undefined'?globalThis:this);
