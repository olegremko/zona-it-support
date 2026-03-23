</script><script>
// ===============================================================
//  ЗОНА ИТ — Shared Data Layer  (shared_db.js)
//  Подключается на обе страницы: портал и виджет
// ===============================================================

const ZIT = (() => {

// -- Ключи хранилища ------------------------------------------
const K = { users:'zit_v1_users', tickets:'zit_v1_tickets', session:'zit_v1_session' };

// -- Защита: XSS ----------------------------------------------
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }

// -- Защита: хэш пароля (FNV-1a) ------------------------------
function hashPwd(s){
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
  return h.toString(16).padStart(8,'0');
}

// -- Защита: шифрование localStorage (XOR + base64) -----------
const EK='zit_secure_2024';
function encrypt(data){
  try {
    const s=JSON.stringify(data);
    let o='';
    for(let i=0;i<s.length;i++) o+=String.fromCharCode(s.charCodeAt(i)^EK.charCodeAt(i%EK.length));
    return btoa(unescape(encodeURIComponent(o)));
  } catch(e){ return btoa(JSON.stringify(data)); }
}
function decrypt(enc){
  try {
    const s=decodeURIComponent(escape(atob(enc)));
    let o='';
    for(let i=0;i<s.length;i++) o+=String.fromCharCode(s.charCodeAt(i)^EK.charCodeAt(i%EK.length));
    return JSON.parse(o);
  } catch(e){ try{ return JSON.parse(atob(enc)); }catch(e2){ return null; } }
}

// -- Защита: rate-limiting попыток входа -----------------------
function rateLimit(action, max=5, windowMs=300000){
  const key='rl_'+action, now=Date.now();
  try {
    const d=JSON.parse(sessionStorage.getItem(key)||'{"c":0,"r":0}');
    if(now>d.r){ d.c=0; d.r=now+windowMs; }
    if(d.c>=max) return false;
    d.c++; sessionStorage.setItem(key,JSON.stringify(d)); return true;
  } catch(e){ return true; }
}

// -- Защита: валидация email -----------------------------------
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

// -- Защита: санитизация имени файла --------------------------
function sanitizeFilename(n){ return String(n||'').replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ ]/g,'').substring(0,255); }

// -- CRUD хранилища --------------------------------------------
function get(key){ try{ const r=localStorage.getItem(key); return r?decrypt(r):null; }catch(e){ return null; } }
function set(key,data){ try{ localStorage.setItem(key,encrypt(data)); return true; }catch(e){ return false; } }

// -- Demo-данные -----------------------------------------------
const DEMO_USER = { id:'demo1', email:'demo@company.ru', name:'Иван Иванов', company:'ООО «Демо Компания»', role:'client', created:0 };
const ENGINEERS = [
  {id:'e1',name:'Алексей Смирнов',  role:'Старший инженер',  initials:'АС'},
  {id:'e2',name:'Дмитрий Козлов',   role:'Инженер',           initials:'ДК'},
  {id:'e3',name:'Мария Волкова',    role:'Специалист 1С',     initials:'МВ'},
  {id:'e4',name:'Иван Романов',     role:'Сетевой инженер',   initials:'ИР'},
  {id:'e5',name:'Елена Тарасова',   role:'Инженер ИБ',        initials:'ЕТ'},
];

function randEng(){ return ENGINEERS[Math.floor(Math.random()*ENGINEERS.length)]; }

// -- Сидирование демо-тикетов ----------------------------------
function seedDemo(){
  if((get(K.tickets)||[]).length) return;
  const now=Date.now(), hr=3600000, day=86400000;
  set(K.tickets,[
    { id:1, subject:'Не работает 1С:Бухгалтерия — ошибка при запуске',
      category:'1С и корпоративное ПО', priority:'high', status:'progress',
      userId:'demo1', assignee:ENGINEERS[2],
      created:now-2*hr, updated:now-20*60000,
      messages:[
        {id:1,from:'user',userId:'demo1',authorName:'Иван Иванов',text:'После обновления 1С не запускается. Ошибка: «Ошибка при работе с информационной базой».',time:now-2*hr,files:[]},
        {id:2,from:'support',authorName:'Мария В.',text:'Принято в работу. Подключаюсь удалённо через AnyDesk.',time:now-1.9*hr,files:[]},
        {id:3,from:'support',authorName:'Мария В.',text:'Вижу проблему — повреждён файл конфигурации. Восстанавливаю из резервной копии, ~15 мин.',time:now-40*60000,files:[]}
      ],
      timeline:[{event:'Создан',time:'09:42'},{event:'Назначен: Мария В.',time:'09:43'},{event:'В работе',time:'10:20'}]
    },
    { id:2, subject:'Настроить VPN для удалённого сотрудника',
      category:'Сетевое оборудование', priority:'normal', status:'open',
      userId:'demo1', assignee:ENGINEERS[3],
      created:now-5*hr, updated:now-3*hr,
      messages:[
        {id:1,from:'user',userId:'demo1',authorName:'Иван Иванов',text:'Нужно подключить нового сотрудника через VPN. ОС: Windows 11.',time:now-5*hr,files:[]},
        {id:2,from:'support',authorName:'Иван Р.',text:'Принято! Для настройки VPN пришлите логин сотрудника в AD.',time:now-4.5*hr,files:[]}
      ],
      timeline:[{event:'Создан',time:'07:00'},{event:'Назначен: Иван Р.',time:'07:30'}]
    },
    { id:3, subject:'Плановое ТО серверной комнаты',
      category:'Серверы и инфраструктура', priority:'normal', status:'done',
      userId:'demo1', assignee:ENGINEERS[1],
      created:now-7*day, updated:now-5*day,
      messages:[
        {id:1,from:'user',userId:'demo1',authorName:'Иван Иванов',text:'Запрос на плановое ТО серверной. Удобно в субботу с 10:00.',time:now-7*day,files:[]},
        {id:2,from:'support',authorName:'Дмитрий К.',text:'Все работы выполнены. Чистка, обновление прошивок, тест UPS — всё в норме. Отчёт прикреплён.',time:now-5*day,files:[{name:'ТО_отчёт_15_01.pdf',size:348200,dataUrl:null}]},
        {id:3,from:'system',text:'Тикет закрыт',time:now-5*day,files:[]}
      ],
      timeline:[{event:'Создан',time:'10:00'},{event:'Выполнен',time:'14:30'},{event:'Закрыт',time:'14:32'}]
    }
  ]);
}

// -- Public API ------------------------------------------------
return {
  esc,

  // Auth
  login(email, password){
    if(!rateLimit('login')) return {ok:false, err:'Слишком много попыток. Подождите 5 мин.'};
    if(!email||!password) return {ok:false, err:'Заполните все поля'};
    if(email==='demo@company.ru' && password==='demo1234'){
      set(K.session, DEMO_USER);
      seedDemo();
      return {ok:true, user:DEMO_USER};
    }
    const users=get(K.users)||[];
    const ph=hashPwd(password);
    const u=users.find(x=>x.email===email && x.passHash===ph);
    if(!u) return {ok:false, err:'Неверный email или пароль'};
    const clean={id:u.id,email:u.email,name:u.name,company:u.company,role:u.role};
    set(K.session, clean);
    seedDemo();
    return {ok:true, user:clean};
  },

  register(name, company, email, password){
    if(!rateLimit('register',3,600000)) return {ok:false, err:'Слишком много попыток.'};
    if(!name.trim()) return {ok:false, err:'Введите имя'};
    if(!validEmail(email)) return {ok:false, err:'Некорректный email'};
    if(password.length<6) return {ok:false, err:'Пароль минимум 6 символов'};
    if(email==='demo@company.ru') return {ok:false, err:'Email уже зарегистрирован'};
    const users=get(K.users)||[];
    if(users.find(u=>u.email===email)) return {ok:false, err:'Email уже зарегистрирован'};
    const nu={id:'u'+Date.now(), email:esc(email), name:esc(name),
      company:esc(company||email), passHash:hashPwd(password), role:'client', created:Date.now()};
    users.push(nu);
    set(K.users, users);
    const clean={id:nu.id,email:nu.email,name:nu.name,company:nu.company,role:nu.role};
    set(K.session, clean);
    seedDemo();
    return {ok:true, user:clean};
  },

  getSession(){ return get(K.session); },
  logout(){ localStorage.removeItem(K.session); },

  // Tickets
  getTickets(){ return get(K.tickets)||[]; },

  createTicket(user, subject, category, priority, description, files){
    const tickets=get(K.tickets)||[];
    const eng=randEng();
    const id=tickets.length ? Math.max(...tickets.map(t=>t.id))+1 : 1;
    const t={
      id, subject:esc(subject), category:esc(category||'Другое'),
      priority:['low','normal','high','critical'].includes(priority)?priority:'normal',
      status:'open', userId:user.id, assignee:eng,
      created:Date.now(), updated:Date.now(),
      messages:[
        {id:1,from:'user',userId:user.id,authorName:user.name,
         text:esc(description), time:Date.now(),
         files:(files||[]).map(f=>({name:sanitizeFilename(f.name),size:f.size,dataUrl:f.dataUrl}))},
        {id:2,from:'system',text:`Тикет создан. Назначен инженер: ${eng.name}`,time:Date.now()+50,files:[]}
      ],
      timeline:[
        {event:'Тикет создан',time:new Date().toLocaleTimeString('ru')},
        {event:`Назначен: ${eng.name}`,time:new Date().toLocaleTimeString('ru')}
      ]
    };
    tickets.push(t);
    set(K.tickets, tickets);
    // Автоответ
    setTimeout(()=>{
      const ts=get(K.tickets)||[];
      const tk=ts.find(x=>x.id===id);
      if(tk && tk.messages.filter(m=>m.from==='support').length===0){
        tk.messages.push({id:Date.now(),from:'support',authorName:eng.name,
          text:`Здравствуйте! Тикет #${String(id).padStart(4,'0')} принят в работу. Изучаю ситуацию, скоро отвечу.`,
          time:Date.now(),files:[]});
        tk.status='progress'; tk.updated=Date.now();
        tk.timeline.push({event:'Принят в работу',time:new Date().toLocaleTimeString('ru')});
        set(K.tickets,ts);
        if(typeof window.onNewMessage==='function') window.onNewMessage(id);
      }
    },2500);
    return {ok:true, ticket:t, id};
  },

  addMessage(ticketId, user, text, files){
    const tickets=get(K.tickets)||[];
    const t=tickets.find(x=>x.id===ticketId);
    if(!t) return {ok:false, err:'Тикет не найден'};
    const msg={id:Date.now(),from:'user',userId:user.id,authorName:user.name,
      text:esc(text||''),time:Date.now(),
      files:(files||[]).map(f=>({name:sanitizeFilename(f.name),size:f.size,dataUrl:f.dataUrl}))};
    t.messages.push(msg); t.updated=Date.now();
    if(t.status==='open') t.status='progress';
    set(K.tickets,tickets);
    // Автоответ
    const delay=1800+Math.random()*1600;
    const replies=['Принято, смотрю на проблему.','Спасибо за уточнение! Работаем.','Понял, уточняю информацию.'];
    setTimeout(()=>{
      const ts=get(K.tickets)||[];
      const tk=ts.find(x=>x.id===ticketId);
      if(!tk) return;
      tk.messages.push({id:Date.now(),from:'support',authorName:tk.assignee?.name||'Поддержка',
        text:replies[Math.floor(Math.random()*replies.length)],time:Date.now(),files:[]});
      tk.updated=Date.now();
      set(K.tickets,ts);
      if(typeof window.onNewMessage==='function') window.onNewMessage(ticketId);
    },delay);
    return {ok:true};
  },

  closeTicket(ticketId){
    const tickets=get(K.tickets)||[];
    const t=tickets.find(x=>x.id===ticketId);
    if(!t) return;
    t.status='closed'; t.updated=Date.now();
    t.messages.push({id:Date.now(),from:'system',text:'Тикет закрыт клиентом',time:Date.now(),files:[]});
    t.timeline.push({event:'Закрыт клиентом',time:new Date().toLocaleTimeString('ru')});
    set(K.tickets,tickets);
  },

  // Helpers
  relTime(ts){
    if(!ts) return '';
    const d=Date.now()-ts,m=60000,h=3600000,day=86400000;
    if(d<m) return 'только что';
    if(d<h) return Math.floor(d/m)+' мин назад';
    if(d<day) return Math.floor(d/h)+' ч назад';
    return new Date(ts).toLocaleDateString('ru',{day:'numeric',month:'short'});
  },
  fmtSize(b){
    if(!b) return '';
    if(b<1024) return b+' Б';
    if(b<1048576) return Math.round(b/1024)+' КБ';
    return (b/1048576).toFixed(1)+' МБ';
  },
  STATUS_LABEL:{open:'Открыт',progress:'В работе',done:'Решён',closed:'Закрыт',new:'Новый'},
  STATUS_COLOR:{open:'#FF9800',progress:'#9C27B0',done:'#00A86B',closed:'#78909C'},
  STATUS_CSS:  {open:'s-open',progress:'s-progress',done:'s-done',closed:'s-closed'},
  PRIO_LABEL:  {low:'Низкий',normal:'Обычный',high:'Высокий',critical:'Критичный'},
};
})();


var CU=null,cTid=null,pri='normal',ntFs=[],mcFs=[],wOpen=false;

function tog(){wOpen=!wOpen;document.getElementById('win').classList.toggle('open',wOpen);document.getElementById('fI').className=wOpen?'fas fa-times':'fas fa-comments';if(wOpen){CU=ZIT.getSession();sw(CU?'t':'g');}try{parent.postMessage({type:'chatToggle',open:wOpen},'*');}catch(e){}}
function closeW(){wOpen=false;document.getElementById('win').classList.remove('open');document.getElementById('fI').className='fas fa-comments';}
function oP(){window.open('/portal','_blank');}

function sw(m){
  CU=ZIT.getSession();
  ['g','a','t'].forEach(function(p){document.getElementById('p'+p).classList.remove('on');});
  document.getElementById('p'+m).classList.add('on');
  var w=document.getElementById('win');
  w.className='win open '+(m==='g'?'hg':m==='a'?'ha':'ht');
  var cfg={g:['<i class="fas fa-robot"></i>','Зона ИТ Бот','Онлайн'],a:['<i class="fas fa-lock"></i>','Вход в кабинет','Портал клиента'],t:['<i class="fas fa-ticket-alt"></i>','Поддержка',CU?CU.name:'Кабинет']}[m];
  document.getElementById('hAv').innerHTML=cfg[0];document.getElementById('hNm').textContent=cfg[1];document.getElementById('hSt').textContent=cfg[2];
  if(m==='t')fTH();
}

var BOT={pc:'Обслуживаем ПК и оргтехнику. От 1500 р/ПК в месяц.',pr:'Базовый от 9900, Оптимальный от 24900, Профессиональный от 49900 р/мес.',en:'Войдите в кабинет и создайте тикет — ответим за 2 минуты!'};
function aM(t,c){var co=document.getElementById('gMs'),d=document.createElement('div');d.className=c;d.textContent=t;co.appendChild(d);co.scrollTop=co.scrollHeight;}
function qr(k){aM(BOT[k]||'Свяжемся в ближайшее время.','bm');}
function gS(){var i=document.getElementById('gIn'),t=i.value.trim();if(!t)return;aM(t,'um');i.value='';setTimeout(function(){aM('Войдите в кабинет для создания официального тикета.','bm');},700);}

function aT(t){['L','R'].forEach(function(x){document.getElementById('at'+x).classList.toggle('on',x===(t==='l'?'L':'R'));});document.getElementById('fL').style.display=t==='l'?'':'none';document.getElementById('fR').style.display=t==='r'?'':'none';document.getElementById('aEr').textContent='';}
function dL(){var r=ZIT.login(document.getElementById('lEm').value.trim(),document.getElementById('lPw').value);if(!r.ok){document.getElementById('aEr').textContent=r.err;return;}CU=r.user;document.getElementById('aEr').textContent='';sw('t');}
function dR(){var r=ZIT.register(document.getElementById('rNm').value.trim(),document.getElementById('rCo').value.trim(),document.getElementById('rEm').value.trim(),document.getElementById('rPw').value);if(!r.ok){document.getElementById('aEr').textContent=r.err;return;}CU=r.user;sw('t');}
function dLo(){ZIT.logout();CU=null;sw('g');}

function fTH(){if(!CU)return;var ini=CU.name.split(' ').map(function(w){return w[0];}).join('').substring(0,2).toUpperCase();document.getElementById('tAv').textContent=ini;document.getElementById('tNm').textContent=CU.name;document.getElementById('tCo').textContent=CU.company||'';tT('l');}
function tT(t){['l','n','c'].forEach(function(x){document.getElementById('tt'+(x==='l'?'L':'N'))&&document.getElementById('tt'+(x==='l'?'L':'N')).classList.toggle('on',x===t);document.getElementById('tc'+(x==='l'?'L':x==='n'?'N':'C')).classList.toggle('on',x===t);});if(t==='l')rL();}
var SC={open:'s-op',progress:'s-pr',done:'s-dn',closed:'s-cl'};
var SL={open:'Открыт',progress:'В работе',done:'Решён',closed:'Закрыт'};
var SK={open:'#FF9800',progress:'#9C27B0',done:'#00A86B',closed:'#78909C'};
function rL(){var al=ZIT.getTickets();var op=al.filter(function(t){return t.status==='open'||t.status==='progress';}).length;var bd=document.getElementById('ob');bd.textContent=op;bd.style.display=op?'':'none';var c=document.getElementById('tLs');if(!al.length){c.innerHTML='<div style="padding:20px;text-align:center;color:var(--mu);font-size:13px">Тикетов нет.<br><span style="color:var(--gr);cursor:pointer;font-weight:600" onclick="tT('n')">Создать</span></div>';return;}c.innerHTML=[].concat(al).reverse().map(function(t){return'<div class="tli" onclick="oT('+t.id+')"><div class="tli-ic" style="background:'+SK[t.status]+'18;color:'+SK[t.status]+'"><i class="fas fa-'+(t.status==='progress'?'spinner':t.status==='done'?'check-circle':t.status==='closed'?'lock':'clock')+'"></i></div><div class="tli-b"><div class="tli-t">#'+String(t.id).padStart(4,'0')+' '+ZIT.esc(t.subject)+'</div><div class="tli-m">'+ZIT.esc(t.category||'')+'</div></div><span class="sb '+(SC[t.status]||'s-cl')+'">'+SL[t.status]+'</span></div>';}).join('');}
function oT(id){var al=ZIT.getTickets(),t=al.find(function(x){return x.id===id;});if(!t)return;cTid=id;mcFs=[];document.getElementById('mcTl').textContent='#'+String(id).padStart(4,'0')+' '+ZIT.esc(t.subject);var bg=document.getElementById('mcBg');bg.className='sb '+(SC[t.status]||'s-cl');bg.textContent=SL[t.status];rMc(t.messages||[]);['l','n'].forEach(function(x){document.getElementById('tt'+(x==='l'?'L':'N')).classList.remove('on');document.getElementById('tc'+(x==='l'?'L':'N')).classList.remove('on');});document.getElementById('tcC').classList.add('on');}
function rMc(msgs){var c=document.getElementById('mcMs');c.innerHTML=msgs.map(function(m){if(m.from==='system')return'<div class="mc-s">'+ZIT.esc(m.text)+'</div>';var own=m.from==='user';var fh=(m.files||[]).map(function(f){if(/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name)&&f.dataUrl)return'<img src="'+f.dataUrl+'" style="max-width:130px;border-radius:7px;margin-top:4px;display:block;cursor:pointer" onclick="window.open(this.src,'_blank')">';return'<div style="font-size:10px;color:'+(own?'rgba(255,255,255,.7)':'var(--gr)')+';margin-top:3px">'+ZIT.esc(f.name||'')+'</div>';}).join('');return'<div>'+(!own?'<div class="mc-n">'+ZIT.esc(m.authorName||'Поддержка')+'</div>':'')+'<div class="'+(own?'mc-u':'mc-b')+'">'+ZIT.esc(m.text||'')+fh+'</div></div>';}).join('');c.scrollTop=c.scrollHeight;}
function mcS(){var inp=document.getElementById('mcIn'),t=inp.value.trim();if(!t&&!mcFs.length)return;ZIT.addMessage(cTid,CU,t,mcFs);inp.value='';mcFs=[];document.getElementById('mcAP').innerHTML='';var tk=ZIT.getTickets().find(function(x){return x.id===cTid;});if(tk)rMc(tk.messages);}
function mcF(fl){Array.from(fl).forEach(function(f){if(f.size>50*1024*1024)return;var r=new FileReader();r.onload=function(e){mcFs.push({name:f.name,size:f.size,dataUrl:e.target.result});var c=document.getElementById('mcAP');c.innerHTML=mcFs.map(function(fi,i){return'<div class="fc"><i class="fas fa-paperclip"></i><span>'+ZIT.esc(fi.name)+'</span><span class="rm" onclick="mcFs.splice('+i+',1);mcF([])">x</span></div>';}).join('');};r.readAsDataURL(f);});}
function sP(el){pri=el.dataset.v;document.querySelectorAll('.po').forEach(function(p){p.classList.remove('on');});el.classList.add('on');}
function ntF(fl){Array.from(fl).forEach(function(f){if(f.size>50*1024*1024)return;var r=new FileReader();r.onload=function(e){ntFs.push({name:f.name,size:f.size,dataUrl:e.target.result});document.getElementById('ntAL').textContent=ntFs.length+' файл(ов)';rFC();};r.readAsDataURL(f);});}
function rFC(){document.getElementById('ntFC').innerHTML=ntFs.map(function(f,i){return'<div class="fc"><i class="fas fa-paperclip"></i><span>'+ZIT.esc(f.name)+'</span><span class="rm" onclick="ntFs.splice('+i+',1);rFC()">x</span></div>';}).join('');}
function sT(){var s=document.getElementById('ntS'),d=document.getElementById('ntD');s.classList.remove('er');d.classList.remove('er');if(!s.value.trim()){s.classList.add('er');s.focus();return;}if(!d.value.trim()){d.classList.add('er');d.focus();return;}var r=ZIT.createTicket(CU,s.value.trim(),document.getElementById('ntC').value,pri,d.value.trim(),ntFs);if(!r.ok)return;s.value='';d.value='';document.getElementById('ntC').value='';ntFs=[];document.getElementById('ntFC').innerHTML='';document.getElementById('ntAL').textContent='Прикрепить файл';pri='normal';document.querySelectorAll('.po').forEach(function(p){p.classList.remove('on');});document.querySelector('.po[data-v=normal]').classList.add('on');setTimeout(function(){oT(r.id);},1600);tT('l');}
window.onNewMessage=function(id){if(cTid===id){var t=ZIT.getTickets().find(function(x){return x.id===id;});if(t)rMc(t.messages);}};
setInterval(function()
setInterval(function(){
  if(wOpen&&CU&&cTid){
    var t=ZIT.getTickets().find(function(x){return x.id===cTid;});
    if(t)rMc(t.messages);
  }
},3000);
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='open'){if(!wOpen)tog();}
  if(e.data&&e.data.type==='openLogin'){if(!wOpen)tog();sw('a');}
});
(function(){
  var s=ZIT.getSession();
  if(s&&s.id){CU=s;}
})();

