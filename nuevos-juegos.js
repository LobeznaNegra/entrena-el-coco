/* Extensión de la Mini App: reutiliza menú, pantallas y estilos de V8. */
(() => {
  const specs = {
    ahorcado: ['🪢 Ahorcado', 'ahorcado_words.json'],
    acertijos: ['💡 Acertijos', 'acertijos.json'],
    desordenada: ['🔀 Palabra desordenada', 'palabras_desordenadas.json'],
    logica: ['🧠 Retos de lógica', 'retos_logica.json'],
    completafrase: ['✍️ Completa la frase', 'completa_frase.json']
  };
  const cache = {};
  let generation = 0;
  const section = document.createElement('section');
  section.id = 'newGamesScreen'; section.className = 'screen hidden';
  document.querySelector('main').append(section);
  const el = (tag, text, cls) => {
    const node = document.createElement(tag); if(text != null) node.textContent = text;
    if(cls) node.className = cls; return node;
  };
  const button = (text, fn, cls='primary wide') => {
    const b = el('button',text,cls); b.type='button'; b.onclick=fn; return b;
  };
  const message = text => { const p=el('p',text,'message');p.setAttribute('aria-live','polite');return p; };
  function base(k) {
    stopTimer(); hideAllScreens(); section.classList.remove('hidden'); section.replaceChildren();
    section.append(button('‹ Todos los juegos',()=>{generation++;showMainMenu();},'mini-back'),el('h1',specs[k][0]));
  }
  function shuffle(items) {
    const a=items.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
  }
  async function open(k) {
    const version=++generation; base(k);section.append(message('Cargando…'));
    try {
      if(!cache[k]) {
        const r=await fetch(specs[k][1]);if(!r.ok)throw new Error('No se encuentra '+specs[k][1]);
        cache[k]=await r.json();if(!Array.isArray(cache[k])||!cache[k].length)throw new Error('Banco vacío');
      }
      if(version!==generation)return;
      base(k);
      const category=el('select');category.setAttribute('aria-label','Categoría');
      for(const c of ['Todas',...new Set(cache[k].map(q=>q.category))])category.append(el('option',c));
      const level=el('select');level.setAttribute('aria-label','Dificultad');
      for(const c of ['Todos los niveles','Fácil','Medio','Difícil','Experto'])level.append(el('option',c));
      section.append(el('label','Categoría'),category);
      if(k==='logica')section.append(el('label','Dificultad'),level);
      section.append(button(k==='ahorcado'?'Nueva palabra':'Empezar 10 rondas',()=>{
        const pool=cache[k].filter(q=>(category.value==='Todas'||q.category===category.value)&&(k!=='logica'||level.value==='Todos los niveles'||q.difficulty===level.value));
        if(!pool.length){section.append(message('No hay retos con estos filtros. Elige otra combinación.'));return;}
        if(k==='ahorcado')hangman(shuffle(pool)[0],[],category.value);
        else quiz(k,shuffle(pool).slice(0,10),0,0);
      }));
      if(k==='ahorcado') {
        try {
          const saved=JSON.parse(localStorage.getItem('coco_ahorcado')||'null');
          const item=saved&&cache[k].find(q=>q.id===saved.id);
          if(item&&Array.isArray(saved.guessed)&&saved.guessed.every(x=>typeof x==='string'&&/^[A-ZÑ]$/.test(x)))section.append(button('Continuar palabra guardada',()=>hangman(item,saved.guessed,saved.category),'secondary wide'));
        }catch(_){}
      }
    }catch(error){if(version===generation){base(k);section.append(message('No se pudo cargar el juego: '+error.message),button('Reintentar',()=>open(k)));}}
  }
  function quiz(k,items,index,score) {
    base(k);
    if(index===items.length){section.append(el('h2','¡Partida terminada!'),el('p',`${score}/${items.length} · ${Math.round(score/items.length*100)}%`),button('Otra partida',()=>open(k)));return;}
    const q=items[index];let answered=false;
    section.append(el('p',`Ronda ${index+1}/${items.length} · ${score} aciertos`),el('h2',q.question||q.masked_phrase||`Ordena: ${q.scrambled}`));
    const answers=el('div',null,'trivial-answers');
    q.options.forEach((option,i)=>answers.append(button(option,()=>{
      if(answered)return;answered=true;
      answers.querySelectorAll('button').forEach((b,j)=>{b.disabled=true;if(j===q.answer)b.classList.add('correct');else if(j===i)b.classList.add('wrong');});
      const good=i===q.answer;
      section.append(message((good?'✅ ¡Correcto!':'❌ Incorrecto')+' · '+(q.phrase||q.options[q.answer])+(q.explanation?'\n'+q.explanation:'')),button(index+1===items.length?'Ver resultado':'Siguiente',()=>quiz(k,items,index+1,score+(good?1:0))));
    },'trivial-answer')));
    section.append(answers);
  }
  // Conserva Ñ como letra diferente; elimina únicamente tildes vocálicas y diéresis.
  const normalize = s => s.toUpperCase().replace(/[ÁÀÂ]/g,'A').replace(/[ÉÈÊ]/g,'E').replace(/[ÍÌÎ]/g,'I').replace(/[ÓÒÔ]/g,'O').replace(/[ÚÙÛÜ]/g,'U');
  function hangman(item,guessed,category) {
    base('ahorcado');const normalized=normalize(item.word);
    const letters=[...normalized].filter(c=>/[A-ZÑ]/.test(c));
    const misses=guessed.filter(c=>!letters.includes(c));
    const won=letters.every(c=>guessed.includes(c));const lost=misses.length>=6;
    try{if(won||lost)localStorage.removeItem('coco_ahorcado');else localStorage.setItem('coco_ahorcado',JSON.stringify({id:item.id,guessed,category}));}catch(_){}
    section.append(el('p',item.category),el('div',[...item.word].map(c=>!/[A-ZÑ]/.test(normalize(c))||guessed.includes(normalize(c))?c:'＿').join(' '),'hangman-word'),el('progress'));
    const progress=section.querySelector('progress');progress.max=6;progress.value=misses.length;progress.setAttribute('aria-label',`Errores ${misses.length} de 6`);
    section.append(el('p',`Errores: ${misses.length}/6 · Falladas: ${misses.join(', ')||'ninguna'}`),el('p','Acertadas: '+(guessed.filter(c=>letters.includes(c)).join(', ')||'ninguna')));
    const keys=el('div',null,'hangman-keys');
    for(const c of 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ') {
      const b=button(c,()=>hangman(item,[...guessed,c],category),'secondary');b.disabled=won||lost||guessed.includes(c);keys.append(b);
    }
    section.append(keys);
    if(won||lost)section.append(message(won?'✅ ¡Palabra completada!':'❌ La palabra era: '+item.word));
    section.append(button('Nueva palabra',()=>{
      const pool=cache.ahorcado.filter(q=>(category==='Todas'||q.category===category)&&q.id!==item.id);
      hangman(shuffle(pool.length?pool:[item])[0],[],category);
    }),button('Cambiar categoría',()=>open('ahorcado'),'secondary wide'));
  }
  for(const [k,spec] of Object.entries(specs)) {
    const card=button('',()=>open(k),'game-card');
    card.append(el('span',spec[0].split(' ')[0],'game-icon'));
    const text=el('span');text.append(el('strong',spec[0].slice(spec[0].indexOf(' ')+1)),el('small',k==='ahorcado'?'Adivina la palabra':'10 rondas por partida'));card.append(text,el('span','›','chev'));
    document.querySelector('.game-menu').append(card);
  }
  const start=window.Telegram?.WebApp?.initDataUnsafe?.start_param||new URLSearchParams(location.search).get('startapp');
  if(specs[start])open(start);
})();
