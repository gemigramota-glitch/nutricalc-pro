/* NutriCalc Pro 2.0.0. Исправленная версия с помощью ИИ.
 * Исходный проект: Георгий Образцов. Модель предназначена для исследования,
 * данные блюд перенесены из исходного проекта и не являются проверенными рецептурами.
 * Без сетевых запросов и внешних библиотек. CommonJS экспорт для независимых тестов.
 */
(function (root) {
  'use strict';
  const VERSION = '3.0.0';
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
      v.age=number(raw.age,'Возраст',7,78);
      if (!Number.isInteger(v.age)) throw new Error('Возраст укажите целым числом лет.');
      v.height=number(raw.height,'Рост, см',100,230);
      v.weight=number(raw.weight,'Вес, кг',v.age<19?10:30,250);
      if(!['male','female'].includes(raw.gender)) throw new Error('Выберите пол для формулы.');
      v.gender=raw.gender;
      v.activity=number(raw.activity,'Коэффициент активности',1.2,1.9);
      if(![1.2,1.375,1.55,1.725,1.9].includes(v.activity)) throw new Error('Выберите коэффициент активности из списка.');
      if(!['maintain','deficit','surplus'].includes(raw.goal)) throw new Error('Выберите сценарий расчёта.');
      v.goal=raw.goal;
      if(v.age<19 && v.goal!=='maintain')throw new Error('До 19 лет автоматические дефицит и профицит отключены.');
    } else v.energy=number(raw.energy,'Энергетическая цель, ккал',600,8000);
    return v;
  }
  function targets(raw) {
    const input=validate(raw);
    let resting=null, energy=input.energy, formula=null;
    if(input.mode==='adult') {
      // Schofield (1985), FAO/WHO/UNU Human energy requirements, Table 5.2:
      // https://www.fao.org/4/y5686e/y5686e07.htm
      // Age bands implemented as [7,10), [10,18), and [18,19).
      // These predict BMR; multiplying by a model PAL is NOT a full paediatric
      // energy requirement: energy for growth is not modelled here.
      if(input.age<19) {
        const male=input.gender==='male', w=input.weight;
        if(input.age<10)resting=male?22.706*w+504.3:20.315*w+485.9;
        else if(input.age<18)resting=male?17.686*w+658.2:13.384*w+692.6;
        else resting=male?15.057*w+692.2:14.818*w+486.6;
        formula='schofield';
      } else {
        resting=10*input.weight+6.25*input.height-5*input.age+(input.gender==='male'?5:-161);
        formula='mifflin';
      }
      const factor=input.goal==='deficit'?.85:input.goal==='surplus'?1.15:1;
      energy=Math.round(resting*input.activity*factor);
      if(!Number.isFinite(energy)||energy<600||energy>8000)
        throw new Error('Оценка выходит за рабочий диапазон модели (600–8000 ккал). Проверьте параметры.');
    }
    return {input,resting,formula, kcal:energy,p:energy*input.proteinPct/400,
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
        targets:t,days,combinations:625,foundAcceptable:candidates(t).filter(x=>x.meets).length,method:'Восстановленный план; показатели и число подходящих вариантов пересчитаны по базе версии 3.0.0.'};
    }catch{return null;}
  }
  const api={VERSION,MEALS,DAYS,foods,DEFAULTS,validate,targets,bounds,portion,total,errors,score,solveCombination,candidates,plan,validateSaved};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.NutriCalc=api;

})(typeof globalThis!=='undefined'?globalThis:this);

        // Global State
        let currentCalculations = {
            bmr: 0,
            tdee: 0,
            proteins: 0,
            fats: 0,
            carbs: 0
        };

        let savedWeek = null;
        let planRevision = 0;
        let lastProfileKey = '';
        let currentMenuMode = 'daily'; // 'daily' or 'weekly'
        let currentNutrientCategory = 'all';

        // Food Database (Categorized with macronutrient densities per 100g)
        const foodDatabase = {
            breakfast: [
                { name: "Овсяная каша на молоке с яблоком и корицей", p: 4, f: 3.5, c: 18, baseGrams: 250, desc: "Медленные углеводы, клетчатка" },
                { name: "Овсяноблин с сыром и зеленью + Яйцо вареное", p: 8, f: 7, c: 12, baseGrams: 200, desc: "Богат белком и полезными жирами" },
                { name: "Творожная запеканка с изюмом и сметаной 10%", p: 12, f: 5, c: 16, baseGrams: 200, desc: "Кальций и легкоусвояемый белок" },
                { name: "Гречневая каша с яйцом пашот и авокадо", p: 6, f: 6, c: 20, baseGrams: 220, desc: "Сложные углеводы и Омега-9" },
                { name: "Скрембл из яиц на цельнозерновом тосте", p: 10, f: 9, c: 15, baseGrams: 180, desc: "Аминокислоты и энергии на утро" }
            ],
            lunch: [
                { name: "Филе куриное запеченное + Гречка + Салат из огурцов", p: 14, f: 3, c: 16, baseGrams: 350, desc: "Классический сбалансированный обед" },
                { name: "Гуляш из индейки + Бурый рис + Тушеные кабачки", p: 12, f: 4, c: 18, baseGrams: 360, desc: "Низкожировое диетическое мясо" },
                { name: "Суп-крем из брокколи с сухариками + Запеченный лосось", p: 9, f: 7, c: 12, baseGrams: 380, desc: "Витамин C и Омега-3 жирные кислоты" },
                { name: "Телятина тушеная + Булгур + Свежие томаты", p: 13, f: 5, c: 17, baseGrams: 350, desc: "Высокое содержание железа и B12" },
                { name: "Запеченный минтай + Квиноа + Запеченная тыква", p: 11, f: 3, c: 15, baseGrams: 340, desc: "Легкий белок и микроэлементы" }
            ],
            snack: [
                { name: "Творог 5% с яблоком и грецкими орехами", p: 11, f: 5, c: 10, baseGrams: 170, desc: "Казеиновый белок для сытости" },
                { name: "Греческий йогурт + Горсть миндаля", p: 7, f: 8, c: 6, baseGrams: 160, desc: "Пробиотики и витамин E" },
                { name: "Печеное яблоко с корицей и мёд + кешью", p: 2, f: 6, c: 18, baseGrams: 180, desc: "Антиоксиданты и магний" },
                { name: "Сэндвич из цельнозернового хлеба с индейкой", p: 10, f: 3, c: 16, baseGrams: 130, desc: "Удобный быстрый перекус" },
                { name: "Фруктовый салат (банан, киви) с семенами тыквы", p: 3, f: 4, c: 20, baseGrams: 180, desc: "Витаминный заряд" }
            ],
            dinner: [
                { name: "Треска на пару + Брокколи и цветная капуста", p: 12, f: 2, c: 6, baseGrams: 300, desc: "Легкий ужин перед сном" },
                { name: "Филе индейки на гриле + Овощное рагу", p: 13, f: 3, c: 8, baseGrams: 320, desc: "Минимум углеводов, максимум белка" },
                { name: "Салат с тунцом, яйцом, черри и листьями шпината", p: 11, f: 5, c: 4, baseGrams: 280, desc: "Легкоусвояемый протеин и клетчатка" },
                { name: "Запеченный судак + Свежий салат с оливковым маслом", p: 12, f: 4, c: 5, baseGrams: 300, desc: "Фосфор и полезные жиры" },
                { name: "Творожная паста с зеленью и огурцом на тосте", p: 10, f: 4, c: 10, baseGrams: 220, desc: "Успокаивающий вечерний перекус" }
            ]
        };

        // Handbook Database (Based on Appendix 3 from Document)
        const nutrientDatabase = [
            { id: 'retinol', name: 'Витамин A (Ретинол)', category: 'vitamin', role: 'Зрение, рост тканей, иммунитет, здоровье кожи', sources: 'Морковь, печень, сливочное масло, яичный желток, брокколи', norm: '800–1000 мкг', icon: 'eye', color: 'amber' },
            { id: 'ascorbic', name: 'Витамин C (Аскорбиновая кислота)', category: 'vitamin', role: 'Антиоксидант, синтез коллагена, укрепление иммунитета', sources: 'Цитрусовые, шиповник, болгарский перец, черная смородина', norm: '60–70 мг', icon: 'shield', color: 'emerald' },
            { id: 'calciferol', name: 'Витамин D (Кальциферол)', category: 'vitamin', role: 'Усвоение кальция и фосфора, здоровье костей и зубов', sources: 'Жирная рыба, рыбий жир, яичный желток, сливочное масло', norm: '10–15 мкг', icon: 'sun', color: 'yellow' },
            { id: 'cobalamin', name: 'Витамин B12 (Кобаламин)', category: 'vitamin', role: 'Кроветворение, функция нервной системы, синтез ДНК', sources: 'Мясо, рыба, моллюски, молочные продукты, яйца', norm: '2.0–3.0 мкг', icon: 'brain', color: 'sky' },
            { id: 'calcium', name: 'Кальций (Ca)', category: 'mineral', role: 'Формирование костей и зубов, нервная проводимость, сокращение мышц', sources: 'Молоко, сыр, творог, кунжут, миндаль, зелень', norm: '1200 мг', icon: 'bone', color: 'slate' },
            { id: 'iron', name: 'Железо (Fe)', category: 'mineral', role: 'Транспорт кислорода (гемоглобин), клеточное дыхание', sources: 'Красное мясо, печень, гречка, чечевица, шпинат', norm: '12–18 мг', icon: 'heart-pulse', color: 'rose' },
            { id: 'magnesium', name: 'Магний (Mg)', category: 'mineral', role: 'Работа мышц и нервной системы, синтез белка, энергетический обмен', sources: 'Орехи, семечки, бананы, какао, цельнозерновые продукты', norm: '300–400 мг', icon: 'zap', color: 'purple' },
            { id: 'thiamine', name: 'Витамин B1 (Тиамин)', category: 'vitamin', role: 'Углеводный обмен, поддержка нервной системы и сердца', sources: 'Овсянка, гречка, свинина, орехи, цельнозерновой хлеб', norm: '1.2–1.5 мг', icon: 'activity', color: 'teal' }
        ];

        function safeIcons() {
            try { if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons(); } catch (_) {}
        }
        window.onload = function() {
            restoreProfile();
            safeIcons();
            calculateNutrients();
            renderHandbook();
        };

        // Tab Switching Logic
        function switchTab(tabId) {
            const tabs = ['calculator', 'menu', 'handbook'];
            tabs.forEach(id => {
                const section = document.getElementById(`section-${id}`);
                const btn = document.getElementById(`tab-${id}`);
                if (id === tabId) {
                    section.classList.remove('hidden');
                    btn.classList.add('active');
                    btn.classList.remove('text-slate-400');
                } else {
                    section.classList.add('hidden');
                    btn.classList.remove('active');
                    btn.classList.add('text-slate-400');
                }
            });
            safeIcons();
        }

        // Calculation Core Algorithm (Mifflin-St Jeor & PAL)
        function setCalculationError(text) {
            const el = document.getElementById('calc-error');
            el.textContent = text || '';
            el.classList.toggle('hidden', !text);
            if (!text) return;
            currentCalculations = { bmr: 0, tdee: 0, proteins: 0, fats: 0, carbs: 0 };
            savedWeek = null;
            lastProfileKey = '';
            ['bmr-val','tdee-val','protein-val','fats-val','carbs-val','menu-target-kcal','menu-target-p','menu-target-f','menu-target-c','print-target-kcal'].forEach(id => document.getElementById(id).innerText = '—');
            document.getElementById('goal-label-text').innerText = 'Проверьте параметры';
            ['daily-menu-container','weekly-menu-container'].forEach(id => document.getElementById(id).innerHTML = '');
            document.getElementById('menu-actual').innerText = 'Сначала введите корректные параметры на вкладке «Калькулятор».';
            document.getElementById('refresh-menu').disabled = true;
            document.getElementById('print-menu').disabled = true;
            ['macroChart','mealChart'].forEach(id=>{const c=document.getElementById(id);if(c && c.getContext('2d'))c.getContext('2d').clearRect(0,0,c.width,c.height);});
            try { localStorage.removeItem('nutricalc-original-v3'); } catch (_) {}
        }
        function profileValues() {
            const selected=document.querySelector('input[name="gender"]:checked');
            const raw={mode:'adult',gender:selected?selected.value:'',proteinPct:25,fatPct:30,carbPct:45,minPct:50,maxPct:150,tolerance:10};
            ['age','height','weight','activity','goal'].forEach(id=>raw[id]=document.getElementById(id).value);
            if(Number(raw.weight)>200)throw new Error('«Вес»: значение не должно превышать 200 кг.');
            return raw;
        }
        function calculateNutrients() {
            try {
                const age=Number(document.getElementById('age').value);
                const child=Number.isInteger(age)&&age>=7&&age<19;
                const goal=document.getElementById('goal');
                Array.from(goal.options || []).forEach(option=>option.disabled=child&&option.value!=='maintain');
                if(child)goal.value='maintain';
                document.getElementById('weight').min=child?'10':'30';
                const targets=NutriCalc.targets(profileValues());
                const key=JSON.stringify(targets.input);
                currentCalculations = {bmr:targets.resting,tdee:targets.kcal,proteins:targets.p,fats:targets.f,carbs:targets.c};
                setCalculationError('');
                document.getElementById('bmr-val').innerText=Math.round(targets.resting).toLocaleString('ru-RU');
                document.getElementById('tdee-val').innerText=targets.kcal.toLocaleString('ru-RU');
                document.getElementById('bmr-formula').innerText=targets.formula==='schofield'?'Оценка энергии покоя (Шофилд, по возрасту и полу)':'Оценка энергии покоя (Миффлин-Сан Жеор, 19–78 лет)';
                document.getElementById('bmr-formula').title=targets.formula==='schofield'?'Шофилд, 1985; FAO, таблица 5.2. Расчёт по массе тела. Рост в эту формулу не входит. https://www.fao.org/4/y5686e/y5686e07.htm':'Mifflin et al., 1990. https://pubmed.ncbi.nlm.nih.gov/2305711/';
                document.getElementById('energy-caption').innerText=child?'Расчётная энергия за день':'Целевая суточная норма';
                document.getElementById('menu-target-label').innerText=child?'Расчётная цель:':'Норма:';
                document.getElementById('print-target-label').innerText=child?'Учебная расчётная цель:':'Рассчитанная суточная норма:';
                document.getElementById('goal-label-text').innerText=child?'Учебная оценка BMR × PAL, без учёта роста; не норма питания. Дефицит и профицит отключены.':targets.input.goal==='deficit'?'Расчётная цель: −15%':targets.input.goal==='surplus'?'Расчётная цель: +15%':'С учётом активности';
                const ids={p:['protein-val','menu-target-p'],f:['fats-val','menu-target-f'],c:['carbs-val','menu-target-c']};
                for(const [k,list] of Object.entries(ids))list.forEach(id=>document.getElementById(id).innerText=Math.round(targets[k]));
                document.getElementById('menu-target-kcal').innerText=targets.kcal;
                document.getElementById('print-target-kcal').innerText=targets.kcal;
                drawMacroChart(targets.p*4,targets.f*9,targets.c*4);
                drawMealChart(targets.kcal);
                if(!savedWeek || key!==lastProfileKey){planRevision=0;savedWeek=NutriCalc.plan(targets,planRevision);lastProfileKey=key;persistProfile();}
                generateMenuContent();
            } catch(error) { setCalculationError(error.message); }
        }
        function persistProfile() {
            try { localStorage.setItem('nutricalc-original-v3',JSON.stringify({profile:profileValues(),plan:savedWeek})); } catch (_) {}
        }
        function restoreProfile() {
            try {
                const stored=JSON.parse(localStorage.getItem('nutricalc-original-v3') || 'null');
                if(!stored)return;
                const t=NutriCalc.targets(stored.profile), restored=NutriCalc.validateSaved(stored.plan);
                if(!restored || JSON.stringify(t.input)!==JSON.stringify(restored.targets.input))return;
                ['age','height','weight','activity','goal'].forEach(id=>document.getElementById(id).value=stored.profile[id]);
                const radio=document.querySelector('input[name="gender"][value="'+t.input.gender+'"]');
                if(radio)radio.checked=true;
                savedWeek=restored;planRevision=restored.revision;lastProfileKey=JSON.stringify(t.input);
            } catch (_) { try { localStorage.removeItem('nutricalc-original-v3'); } catch (_) {} }
        }

        // Draw Canvas Pie Chart for Macros
        function drawMacroChart(pCal, fCal, cCal) {
            const canvas = document.getElementById('macroChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const total = pCal + fCal + cCal;
            if (total === 0) return;

            const slices = [
                { value: pCal / total, color: '#38bdf8' }, // Sky-400
                { value: fCal / total, color: '#fbbf24' }, // Amber-400
                { value: cCal / total, color: '#34d399' }  // Emerald-400
            ];

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let startAngle = -Math.PI / 2;

            slices.forEach(slice => {
                const angle = slice.value * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(72, 72, 60, startAngle, startAngle + angle);
                ctx.arc(72, 72, 36, startAngle + angle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();
                startAngle += angle;
            });
        }

        // Draw Canvas Pie Chart for Meal Calories
        function drawMealChart(tdee) {
            const canvas = document.getElementById('mealChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            // 25% Breakfast, 35% Lunch, 15% Snack, 25% Dinner
            const slices = [
                { value: 0.25, color: '#818cf8' }, // Indigo
                { value: 0.35, color: '#10b981' }, // Emerald
                { value: 0.15, color: '#f43f5e' }, // Rose
                { value: 0.25, color: '#0ea5e9' }  // Sky
            ];

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let startAngle = -Math.PI / 2;

            slices.forEach(slice => {
                const angle = slice.value * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(72, 72, 60, startAngle, startAngle + angle);
                ctx.arc(72, 72, 36, startAngle + angle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();
                startAngle += angle;
            });
        }

        function generateMenuContent() {
            if (!savedWeek) return;
            const day=savedWeek.days[0];
            document.getElementById('menu-actual').innerText=currentMenuMode==='daily'?planSummary(day):'Фактические калории, БЖУ и отклонения показаны отдельно для каждого дня. Допуск: ±10%.';
            document.getElementById('refresh-menu').disabled=savedWeek.foundAcceptable===1;
            document.getElementById('print-menu').disabled=false;
            if (currentMenuMode === 'daily') renderDailyMenu(currentCalculations.tdee);
            else renderWeeklyMenu(currentCalculations.tdee);
        }
        function planSummary(day) {
            const s=day.totals, e=day.errors;
            const deviations=['kcal','p','f','c'].map(k=>(e[k]>=0?'+':'')+(e[k]*100).toFixed(1)+'%').join(' / ');
            const status=day.meets?'В пределах ±10% по калориям и БЖУ.':'Найденный вариант не укладывается в ±10% по всем целям.';
            const repeats=savedWeek && savedWeek.foundAcceptable===1?' В допуске найден один вариант; повторы на неделе неизбежны среди найденных вариантов.':'';
            return 'Фактически: '+Math.round(s.kcal)+' ккал · Б '+s.p.toFixed(1)+' г · Ж '+s.f.toFixed(1)+' г · У '+s.c.toFixed(1)+' г. Отклонения (ккал/Б/Ж/У): '+deviations+'. '+status+repeats;
        }
        function originalFood(index,part) {
            const key=['breakfast','lunch','snack','dinner'][index];
            return foodDatabase[key][Number(part.id.slice(1))-1];
        }
        function displayPortion(part) {
            return {...part,kcal:Math.round(part.kcal),p:part.p.toFixed(1),f:part.f.toFixed(1),c:part.c.toFixed(1)};
        }
        function calculatePortion(item,targetKcal) {
            const density=(4*item.p+9*item.f+4*item.c)/100;
            if(!Number.isFinite(targetKcal)||targetKcal<=0||!Number.isFinite(density)||density<=0)throw new Error('Некорректные данные порции.');
            const lower=Math.ceil(item.baseGrams*.5/10)*10,upper=Math.floor(item.baseGrams*1.5/10)*10;
            const grams=Math.max(lower,Math.min(upper,Math.round(targetKcal/density/10)*10));
            return {grams,kcal:density*grams,p:item.p*grams/100,f:item.f*grams/100,c:item.c*grams/100};
        }

        function renderDailyMenu(tdee) {
            const dailyContainer = document.getElementById('daily-menu-container');
            dailyContainer.innerHTML = '';

            const mealsConfig = [
                { key: 'breakfast', title: 'Завтрак', percent: 25, time: '08:00', icon: 'sun', color: 'indigo' },
                { key: 'lunch', title: 'Обед', percent: 35, time: '13:00', icon: 'utensils', color: 'emerald' },
                { key: 'snack', title: 'Перекус', percent: 15, time: '16:30', icon: 'coffee', color: 'rose' },
                { key: 'dinner', title: 'Ужин', percent: 25, time: '19:00', icon: 'moon', color: 'sky' }
            ];

            mealsConfig.forEach((meal,index) => {
                const part=savedWeek.days[0].items[index];
                const rawFood=originalFood(index,part);
                const portion=displayPortion(part);

                const cardHtml = `
                    <div class="glass-card rounded-2xl p-5 border-l-4 border-l-${meal.color}-500 transition-all hover:border-slate-600">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                            <div class="flex items-center space-x-3">
                                <div class="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 text-${meal.color}-400">
                                    <i data-lucide="${meal.icon}" class="w-5 h-5"></i>
                                </div>
                                <div>
                                    <h3 class="font-bold text-white text-base">${meal.title} <span class="text-xs font-normal text-slate-400">(${meal.percent}%)</span></h3>
                                    <span class="text-[11px] text-slate-500 font-medium">Рекомендуемое время: ${meal.time}</span>
                                </div>
                            </div>
                            <div class="text-left sm:text-right">
                                <span class="text-lg font-black text-emerald-400">${portion.kcal} <span class="text-xs font-normal text-slate-400">ккал</span></span>
                                <p class="text-[11px] text-slate-400">Порция: ~${portion.grams}г</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 mb-3">
                            <p class="font-semibold text-slate-200 text-sm">${rawFood.name}</p>
                            <p class="text-xs text-slate-400 mt-0.5">${rawFood.desc}</p>
                        </div>

                        <div class="meal-macros flex items-center space-x-4 text-xs">
                            <span class="text-slate-400">БЖУ блюда:</span>
                            <span class="text-sky-400 font-medium">Б: ${portion.p}г</span>
                            <span class="text-amber-400 font-medium">Ж: ${portion.f}г</span>
                            <span class="text-emerald-400 font-medium">У: ${portion.c}г</span>
                        </div>
                    </div>
                `;
                dailyContainer.insertAdjacentHTML('beforeend', cardHtml);
            });

            safeIcons();
        }

        function renderWeeklyMenu(tdee) {
            const weeklyContainer = document.getElementById('weekly-menu-container');
            weeklyContainer.innerHTML = '';

            const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

            days.forEach((day, index) => {
                const dayPlan=savedWeek.days[index];
                const [bFood,lFood,sFood,dFood]=dayPlan.items.map((part,i)=>originalFood(i,part));
                const [bPortion,lPortion,sPortion,dPortion]=dayPlan.items.map(displayPortion);

                const dayHtml = `
                    <div class="glass-card rounded-2xl p-5 space-y-3">
                        <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                            <h3 class="font-bold text-emerald-400 text-base flex items-center space-x-2">
                                <i data-lucide="calendar" class="w-4 h-4"></i>
                                <span>${day}</span>
                            </h3>
                            <span class="text-xs text-slate-400">Итого: ${Math.round(dayPlan.totals.kcal)} ккал</span>
                        </div>
                        
                        <p class="text-xs ${dayPlan.meets?'text-emerald-400':'text-amber-400'}">${planSummary(dayPlan)}</p>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span class="text-indigo-400 font-bold block mb-1">Завтрак (${bPortion.kcal} ккал)</span>
                                <p class="text-slate-300 font-medium">${bFood.name}</p>
                                <span class="text-slate-500 text-[10px]">${bPortion.grams} г | Б:${bPortion.p} Ж:${bPortion.f} У:${bPortion.c}</span>
                            </div>
                            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span class="text-emerald-400 font-bold block mb-1">Обед (${lPortion.kcal} ккал)</span>
                                <p class="text-slate-300 font-medium">${lFood.name}</p>
                                <span class="text-slate-500 text-[10px]">${lPortion.grams} г | Б:${lPortion.p} Ж:${lPortion.f} У:${lPortion.c}</span>
                            </div>
                            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span class="text-rose-400 font-bold block mb-1">Перекус (${sPortion.kcal} ккал)</span>
                                <p class="text-slate-300 font-medium">${sFood.name}</p>
                                <span class="text-slate-500 text-[10px]">${sPortion.grams} г | Б:${sPortion.p} Ж:${sPortion.f} У:${sPortion.c}</span>
                            </div>
                            <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span class="text-sky-400 font-bold block mb-1">Ужин (${dPortion.kcal} ккал)</span>
                                <p class="text-slate-300 font-medium">${dFood.name}</p>
                                <span class="text-slate-500 text-[10px]">${dPortion.grams} г | Б:${dPortion.p} Ж:${dPortion.f} У:${dPortion.c}</span>
                            </div>
                        </div>
                    </div>
                `;
                weeklyContainer.insertAdjacentHTML('beforeend', dayHtml);
            });

            safeIcons();
        }

        function setMenuMode(mode) {
            currentMenuMode = mode;
            const btnDaily = document.getElementById('btn-mode-daily');
            const btnWeekly = document.getElementById('btn-mode-weekly');
            const dailyContainer = document.getElementById('daily-menu-container');
            const weeklyContainer = document.getElementById('weekly-menu-container');

            if (mode === 'daily') {
                btnDaily.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white transition-all';
                btnWeekly.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all';
                dailyContainer.classList.remove('hidden');
                weeklyContainer.classList.add('hidden');
            } else {
                btnWeekly.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white transition-all';
                btnDaily.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all';
                weeklyContainer.classList.remove('hidden');
                dailyContainer.classList.add('hidden');
            }
            generateMenuContent();
        }

        function regenerateMenu() {
            if(!savedWeek)return;
            savedWeek=NutriCalc.plan(savedWeek.targets,++planRevision);
            persistProfile();
            generateMenuContent();
        }

        // Handbook Render & Search Logic
        function renderHandbook() {
            const container = document.getElementById('handbook-cards-container');
            container.innerHTML = '';

            const searchQuery = document.getElementById('nutrientSearch')?.value.toLowerCase() || '';

            const filtered = nutrientDatabase.filter(item => {
                const matchesCategory = (currentNutrientCategory === 'all') || (item.category === currentNutrientCategory);
                const matchesSearch = item.name.toLowerCase().includes(searchQuery) || 
                                      item.role.toLowerCase().includes(searchQuery) || 
                                      item.sources.toLowerCase().includes(searchQuery);
                return matchesCategory && matchesSearch;
            });

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="col-span-2 text-center py-8 text-slate-500 text-sm">
                        Нутриенты по вашему запросу не найдены.
                    </div>
                `;
                return;
            }

            filtered.forEach(item => {
                const card = `
                    <div class="glass-card rounded-2xl p-5 border-t-2 border-t-${item.color}-400 space-y-3 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center space-x-2">
                                    <div class="p-2 bg-slate-900 rounded-lg text-${item.color}-400">
                                        <i data-lucide="${item.icon}" class="w-4 h-4"></i>
                                    </div>
                                    <h3 class="font-bold text-slate-100 text-sm">${item.name}</h3>
                                </div>
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                    ${item.category === 'vitamin' ? 'Витамин' : 'Минерал'}
                                </span>
                            </div>

                            <div class="space-y-2 text-xs">
                                <div>
                                    <span class="text-slate-400 font-medium">Биологическая роль:</span>
                                    <p class="text-slate-200 mt-0.5">${item.role}</p>
                                </div>
                                <div>
                                    <span class="text-slate-400 font-medium">Источники:</span>
                                    <p class="text-emerald-400/90 mt-0.5">${item.sources}</p>
                                </div>
                            </div>
                        </div>

                        <div class="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                            <span class="text-slate-500">Возрастная норма:</span>
                            <span class="font-bold text-slate-200 bg-slate-900 px-2 py-1 rounded-md border border-slate-800" title="Норма зависит от возраста и пола; значения из приложения проекта не являются персональным назначением"><a href="https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx" target="_blank" rel="noopener noreferrer">См. источник</a></span>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', card);
            });

            safeIcons();
        }

        function filterNutrients() {
            renderHandbook();
        }

        function filterNutrientCategory(cat) {
            currentNutrientCategory = cat;
            ['all', 'vitamin', 'mineral'].forEach(c => {
                const btn = document.getElementById(`filter-${c}`);
                if (c === cat) {
                    btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white';
                } else {
                    btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:text-white';
                }
            });
            renderHandbook();
        }

// API для проверки исходного интерфейса и численных инвариантов.
window.NutriCalcOriginal={profileValues,calculateNutrients,calculatePortion,planSummary,getPlan:()=>savedWeek,getMode:()=>currentMenuMode};
