const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8'), html=fs.readFileSync(__dirname+'/index.html','utf8');
function env(storageFails=false){
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 const fields={age:'30',height:'168',weight:'58',activity:'1.55',goal:'maintain',nutrientSearch:''},els={},store=new Map();let gender='male';
 const ctx={clearRect(){},beginPath(){},arc(){},closePath(){},fill(){}};
 for(const id of ids)els[id]={value:fields[id]??'',innerHTML:'',innerText:'',textContent:'',width:144,height:144,disabled:false,
 classList:{add(){},remove(){},toggle(){}},getContext(){return ctx;},insertAdjacentHTML(_,s){this.innerHTML+=s;}};
 const document={getElementById:id=>{if(!els[id])throw Error('Missing HTML id '+id);return els[id];},querySelector(sel){
  if(sel==='input[name="gender"]:checked')return {value:gender};
  const m=sel.match(/value="(male|female)"/);if(m)return {set checked(v){if(v)gender=m[1];}};
  throw Error('Unknown selector '+sel);
 }};
 const context={console,document,localStorage:{getItem(k){if(storageFails)throw Error();return store.get(k)||null;},setItem(k,v){if(storageFails)throw Error();store.set(k,v);},removeItem(k){if(storageFails)throw Error();store.delete(k);}}};context.window=context;
 vm.createContext(context);vm.runInContext(source,context);
 return {c:context,els,store,run:s=>vm.runInContext(s,context)};
}
let count=0;function test(name,f){f();console.log('OK',name);count++;}function near(a,b){assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
const e=env();e.c.onload();
test('Все исходные вкладки, диаграммы и поля сохранены',()=>{for(const id of ['section-calculator','section-menu','section-handbook','calcForm','macroChart','mealChart','btn-mode-daily','btn-mode-weekly','nutrientSearch'])assert.ok(e.els[id]);});
test('Запуск без Lucide не останавливает расчёт',()=>{assert.equal(e.c.NutriCalcOriginal.getPlan().days.length,7);assert.ok(Number(e.els['tdee-val'].innerText.replace(/\D/g,''))>0);});
test('Согласованность исходной базы и расчётной базы',()=>{assert.equal(e.run(`Object.entries(foodDatabase).every(([key,foods])=>foods.every((f,i)=>['p','f','c','baseGrams'].every(k=>f[k]===NutriCalc.foods[key][i][k])))`),true);});
test('Возраст вне диапазона 7–78 и дробный возраст отклоняются',()=>{for(const age of ['6','79','999','', '7.5']){const d=env();d.els.age.value=age;d.c.calculateNutrients();assert.equal(d.c.NutriCalcOriginal.getPlan(),null);assert.ok(d.els['calc-error'].textContent.length);}});
test('Пустые, отрицательные и выходящие за диапазон значения отклоняются',()=>{for(const [field,val] of [['weight','-58'],['weight','201'],['height','0'],['height','999'],['weight',''],['age','0'],['activity','1.4']]){const d=env();d.els[field].value=val;d.c.calculateNutrients();assert.equal(d.c.NutriCalcOriginal.getPlan(),null);}});
test('Дробные рост и вес допустимы',()=>{const d=env();d.els.weight.value='58.5';d.els.height.value='168.5';d.c.calculateNutrients();assert.ok(d.c.NutriCalcOriginal.getPlan());});
test('Независимый эталон формулы без промежуточного округления',()=>{const d=env();d.els.goal.value='deficit';d.c.calculateNutrients();const p=d.c.NutriCalcOriginal.getPlan();assert.equal(p.targets.kcal,Math.round((10*58+6.25*168-5*30+5)*1.55*.85));});
test('Перебор содержит 625 сочетаний',()=>{const p=e.c.NutriCalcOriginal.getPlan();assert.equal(p.combinations,625);});
test('20 сценариев: реальные суммы, БЖУ, ограничения порций и статусы',()=>{
 const C=e.c.NutriCalc;
 for(const energy of [600,1200,2000,2400,8000])for(const ratios of [[25,30,45],[20,25,55],[80,10,10],[10,10,80]]){
 const t=C.targets({...C.DEFAULTS,energy,proteinPct:ratios[0],fatPct:ratios[1],carbPct:ratios[2]}),p=C.plan(t);
 for(const d of p.days){const sums={kcal:0,p:0,f:0,c:0};d.items.forEach((x,i)=>{const f=C.foods[C.MEALS[i].key].find(f=>f.id===x.id),lim=C.bounds(f,t.input);assert.ok(x.grams>=lim.min&&x.grams<=lim.max);assert.equal(x.grams%10,0);for(const k of Object.keys(sums)){near(x[k],f[k]*x.grams/100);sums[k]+=x[k];}});
 for(const k of Object.keys(sums))near(sums[k],d.totals[k]);near(d.totals.kcal,4*d.totals.p+9*d.totals.f+4*d.totals.c);assert.equal(d.meets,Object.keys(sums).every(k=>Math.abs(sums[k]/t[k]-1)<=.1+1e-12));}
 }});
test('Дневное меню и понедельник недели совпадают и переключение не меняет план',()=>{const before=JSON.stringify(e.c.NutriCalcOriginal.getPlan());e.c.setMenuMode('weekly');assert.equal(JSON.stringify(e.c.NutriCalcOriginal.getPlan()),before);e.c.setMenuMode('daily');assert.equal(JSON.stringify(e.c.NutriCalcOriginal.getPlan()),before);assert.ok(e.els['weekly-menu-container'].innerHTML.includes('Понедельник'));});
test('Сохранённый план восстанавливается',()=>{const p=e.c.NutriCalcOriginal.getPlan();const d=env();d.store.set('nutricalc-original-v3',JSON.stringify({profile:p.targets.input,plan:p}));d.c.onload();assert.equal(JSON.stringify(d.c.NutriCalcOriginal.getPlan().days),JSON.stringify(p.days));});
test('Повреждённое хранилище не останавливает запуск',()=>{const d=env();d.store.set('nutricalc-original-v3','{broken');d.c.onload();assert.ok(d.c.NutriCalcOriginal.getPlan());});
test('Отказ localStorage не останавливает расчёт',()=>{const d=env(true);d.c.onload();assert.ok(d.c.NutriCalcOriginal.getPlan());});
test('После неверного ввода старое меню скрыто и печать отключена',()=>{const d=env();d.c.onload();d.els.age.value='';d.c.calculateNutrients();assert.equal(d.els['daily-menu-container'].innerHTML,'');assert.equal(d.els['print-menu'].disabled,true);assert.equal(d.els['bmr-val'].innerText,'—');});
test('Прямая функция порции ограничивает массу и считает фактическую энергию',()=>{const f=e.run('foodDatabase.dinner[0]'),p=e.c.calculatePortion(f,100000);assert.equal(p.grams,450);near(p.kcal,405);assert.throws(()=>e.c.calculatePortion(f,-1));});
test('Справочник и поиск сохраняют исходные карточки',()=>{e.c.renderHandbook();assert.ok(e.els['handbook-cards-container'].innerHTML.includes('Витамин A'));e.els.nutrientSearch.value='qwerty';e.c.filterNutrients();assert.ok(e.els['handbook-cards-container'].innerHTML.includes('не найдены'));});

test('Независимые эталоны Шофилда для обоих полов и границ возрастных групп',()=>{
 const C=e.c.NutriCalc;
 for(const gender of ['male','female'])for(const age of [7,9,10,17,18]){
 const weight=age<10?22:age<18?45:58;
 const p=C.targets({...C.DEFAULTS,mode:'adult',age,weight,gender,goal:'maintain'});
 const male=gender==='male';
 const expected=age<10?(male?22.706*weight+504.3:20.315*weight+485.9):age<18?(male?17.686*weight+658.2:13.384*weight+692.6):(male?15.057*weight+692.2:14.818*weight+486.6);
 near(p.resting,expected);assert.equal(p.formula,'schofield');assert.equal(p.kcal,Math.round(expected*1.55));
 }
 assert.equal(C.targets({...C.DEFAULTS,mode:'adult',age:19}).formula,'mifflin');
});
test('Дефицит и профицит запрещены в численном ядре до 19 лет',()=>{
 const C=e.c.NutriCalc;for(const age of [7,15,18])for(const goal of ['deficit','surplus'])assert.throws(()=>C.targets({...C.DEFAULTS,mode:'adult',age,goal}));
});
test('В интерфейсе возраст 7 лет и вес 22 кг дают расчёт без назначения нормы',()=>{
 const d=env();d.els.age.value='7';d.els.weight.value='22';d.els.height.value='120';d.els.goal.value='deficit';d.c.calculateNutrients();
 const plan=d.c.NutriCalcOriginal.getPlan();assert.ok(plan);near(plan.targets.resting,22.706*22+504.3);assert.equal(d.els.goal.value,'maintain');assert.equal(d.els.weight.min,'10');assert.ok(d.els['goal-label-text'].innerText.includes('не норма питания'));
 assert.ok(d.els['bmr-formula'].innerText.includes('Шофилд'));
});
test('Возврат к взрослому возрасту сохраняет взрослую формулу и ограничения веса',()=>{
 const d=env();d.els.age.value='7';d.c.calculateNutrients();d.els.age.value='30';d.c.calculateNutrients();assert.equal(d.els.weight.min,'30');assert.equal(d.c.NutriCalcOriginal.getPlan().targets.formula,'mifflin');
});
console.log('Проверок пройдено:',count);

