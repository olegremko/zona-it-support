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


var CU=null,cTid=null,ntPri='normal',ntFs=[],chatFs=[],fSt2='all',fSr='';
var ENGS=['Алексей С.','Дмитрий К.','Мария В.','Иван Р.','Елена Т.'];
var SC={open:'b-op',progress:'b-pr',done:'b-dn',closed:'b-cl'};
var SL={open:'Открыт',progress:'В работе',done:'Решён',closed:'Закрыт'};
var SK={open:'#FF9800',progress:'#9C27B0',done:'#00A86B',closed:'#78909C'};
var PL={low:'Низкий',normal:'Обычный',high:'Высокий',critical:'Критичный'};
var PC={low:'p-lo',normal:'p-no',high:'p-hi',critical:'p-cr'};

function aTab(t,el){document.querySelectorAll('.act').forEach(function(e){e.classList.remove('on');});el.classList.add('on');document.getElementById('fL').style.display=t==='l'?'':'none';document.getElementById('fR').style.display=t==='r'?'':'none';document.getElementById('acE').textContent='';}
function dL(){var r=ZIT.login(document.getElementById('lEm').value.trim(),document.getElementById('lPw').value);if(!r.ok){document.getElementById('acE').textContent=r.err;return;}CU=r.user;sApp();}
function dR(){var r=ZIT.register(document.getElementById('rNm').value.trim(),document.getElementById('rCo').value.trim(),document.getElementById('rEm').value.trim(),document.getElementById('rPw').value);if(!r.ok){document.getElementById('acE').textContent=r.err;return;}CU=r.user;sApp();}
function dLo(){ZIT.logout();CU=null;document.getElementById('app').style.display='none';document.getElementById('asc').style.display='flex';}

function sApp(){
  document.getElementById('asc').style.display='none';
  document.getElementById('app').style.display='flex';
  var ini=CU.name.split(' ').map(function(w){return w[0];}).join('').substring(0,2).toUpperCase();
  document.getElementById('sbA').textContent=ini;
  document.getElementById('sbN').textContent=CU.name;
  document.getElementById('sbC').textContent=CU.company||'';
  rDash();rList();stSt();
}

var VM={dash:'Дашборд',tix:'Мои тикеты',chat:'Тикет',new:'Новый тикет'};
function sV(n,el){
  document.querySelectorAll('.vw').forEach(function(v){v.classList.remove('on');});
  document.querySelectorAll('.ni').forEach(function(i){i.classList.remove('on');});
  var v=document.getElementById('v-'+n);if(v)v.classList.add('on');
  if(el)el.classList.add('on');
  document.getElementById('tbT').textContent=VM[n]||n;
  if(n==='dash')rDash();
  if(n==='tix')rList();
}

function rDash(){
  var al=ZIT.getTickets();
  document.getElementById('stO').textContent=al.filter(function(t){return t.status==='open';}).length;
  document.getElementById('stP').textContent=al.filter(function(t){return t.status==='progress';}).length;
  document.getElementById('stD').textContent=al.filter(function(t){return t.status==='done'||t.status==='closed';}).length;
  document.getElementById('mW').textContent=al.filter(function(t){return t.status==='progress';}).length;
  var c=document.getElementById('dLst');
  var rc=[].concat(al).reverse().slice(0,5);
  if(!rc.length){c.innerHTML='<div class="es"><i class="fas fa-inbox"></i><p>Тикетов пока нет</p></div>';return;}
  c.innerHTML=rc.map(function(t){return'<div class="tli" onclick="oTk('+t.id+')"><div class="tli-ic" style="background:'+SK[t.status]+'18;color:'+SK[t.status]+'"><i class="fas fa-'+(t.status==='progress'?'spinner':t.status==='done'?'check-circle':t.status==='closed'?'lock':'clock')+'"></i></div><div class="tli-b"><div class="tli-t">'+ZIT.esc(t.subject)+'</div><div class="tli-m"><span class="bg '+(SC[t.status]||'b-cl')+'">'+SL[t.status]+'</span><span class="pb '+(PC[t.priority]||'p-no')+'">'+PL[t.priority]+'</span></div></div><span style="font-size:11px;color:var(--mu)">'+ZIT.relTime(t.updated)+'</span></div>';}).join('');
  document.getElementById('eLst').innerHTML=ENGS.map(function(n){return'<div class="ec"><div class="ea">'+n.split(' ').map(function(w){return w[0];}).join('')+'</div><div><div class="en">'+n+'</div><div class="er2">Инженер</div></div><div class="ed"></div></div>';}).join('');
}

function rList(){
  var al=ZIT.getTickets();
  var op=al.filter(function(t){return t.status==='open'||t.status==='progress';}).length;
  var nb=document.getElementById('nb');nb.textContent=op;nb.style.display=op?'flex':'none';
  var fl=al.filter(function(t){var ms=fSt2==='all'||t.status===fSt2;var ms2=!fSr||ZIT.esc(t.subject).toLowerCase().includes(fSr.toLowerCase());return ms&&ms2;});
  var c=document.getElementById('tBody');
  if(!fl.length){c.innerHTML='<div class="es"><i class="fas fa-search"></i><p>Тикетов не найдено</p></div>';return;}
  c.innerHTML=[].concat(fl).reverse().map(function(t){return'<div class="ttr" onclick="oTk('+t.id+')"><div class="tid">#'+String(t.id).padStart(4,'0')+'</div><div class="ttw"><div class="ttt">'+ZIT.esc(t.subject)+'</div><div class="ttc">'+ZIT.esc(t.category||'')+'</div></div><div><span class="bg '+(SC[t.status]||'b-cl')+'">'+SL[t.status]+'</span></div><div><span class="pb '+(PC[t.priority]||'p-no')+'">'+PL[t.priority]+'</span></div><div class="tas"><div class="taa">'+(t.assignee?t.assignee.initials:'?')+'</div><span style="font-size:12px;color:var(--tx)">'+(t.assignee?t.assignee.name.split(' ')[0]:'—')+'</span></div><div style="font-size:12px;color:var(--mu)">'+ZIT.relTime(t.updated)+'</div></div>';}).join('');
}
function fSt(s,el){fSt2=s;document.querySelectorAll('.fr .ch').forEach(function(c){c.classList.remove('on');});el.classList.add('on');rList();}
function fSearch(v){fSr=v;rList();}

function oTk(id){
  var al=ZIT.getTickets(),t=al.find(function(x){return x.id===id;});if(!t)return;
  cTid=id;chatFs=[];
  document.getElementById('ciN').textContent='#'+String(id).padStart(4,'0');
  document.getElementById('ciS').innerHTML='<span class="bg '+(SC[t.status]||'b-cl')+'">'+SL[t.status]+'</span>';
  document.getElementById('ciP').innerHTML='<span class="pb '+(PC[t.priority]||'p-no')+'">'+PL[t.priority]+'</span>';
  document.getElementById('ciC').textContent=t.category||'—';
  document.getElementById('ciD').textContent=new Date(t.created).toLocaleDateString('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  document.getElementById('ciEA').textContent=t.assignee?t.assignee.initials:'?';
  document.getElementById('ciEN').textContent=t.assignee?t.assignee.name:'—';
  document.getElementById('ciER').textContent=t.assignee?t.assignee.role:'—';
  document.getElementById('ciTL').innerHTML=(t.timeline||[]).map(function(x,i,a){return'<div class="tl"><div class="tll"><div class="tld'+(i===a.length-1?' f':'')+'"></div><div class="tll2"></div></div><div><div class="tlev">'+ZIT.esc(x.event)+'</div><div class="tltm">'+x.time+'</div></div></div>';}).join('');
  document.getElementById('chT').textContent=t.subject;
  document.getElementById('chB').innerHTML='<span class="bg '+(SC[t.status]||'b-cl')+'">'+SL[t.status]+'</span>';
  document.getElementById('rBtn').style.display=t.status==='closed'?'none':'';
  rMsgs(t.messages||[]);
  sV('chat',null);
  document.querySelectorAll('.ni[onclick*="tix"]').forEach(function(n){n.classList.add('on');});
}

function fi2(name){var e=(name||'').split('.').pop().toLowerCase();var m={pdf:'file-pdf',doc:'file-word',docx:'file-word',xls:'file-excel',xlsx:'file-excel',zip:'file-archive',mp4:'file-video',mov:'file-video'};return'fa-'+(m[e]||'file-alt');}

function rMsgs(msgs){
  var c=document.getElementById('msgs');
  c.innerHTML=msgs.map(function(m){
    if(m.from==='system')return'<div class="mg sy"><div class="mb sy2">'+ZIT.esc(m.text)+'</div></div>';
    var own=m.from==='user';
    var ini=own?(CU?CU.name.split(' ').map(function(w){return w[0];}).join('').substring(0,2):'Вы'):(m.authorName||'ИТ').substring(0,2);
    var fh=(m.files||[]).map(function(f){if(/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name)&&f.dataUrl)return'<img class="mim" src="'+f.dataUrl+'" onclick="document.getElementById('imI').src=this.src;document.getElementById('im').classList.add('on')">';return'<div class="mat"><div class="mai"><i class="fas '+fi2(f.name)+'"></i></div><div><div class="man">'+ZIT.esc(f.name||'')+'</div><div class="mas">'+ZIT.fmtSize(f.size)+'</div></div></div>';}).join('');
    return'<div class="mg'+(own?' ow':'')+' "><div class="mav'+(own?' g':'')+'">'+ini+'</div><div class="mc">'+(!own?'<div class="msn">'+ZIT.esc(m.authorName||'Поддержка')+'</div>':'')+'<div class="mb '+(own?'ot':'ic')+'">'+ZIT.esc(m.text||'')+fh+'</div><div class="mt">'+new Date(m.time).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})+'</div></div></div>';
  }).join('');
  c.scrollTop=c.scrollHeight;
}

function sMsg(){var inp=document.getElementById('mInp'),t=inp.value.trim();if(!t&&!chatFs.length)return;ZIT.addMessage(cTid,CU,t,chatFs);inp.value='';chatFs=[];document.getElementById('achp').innerHTML='';inp.style.height='auto';var tk=ZIT.getTickets().find(function(x){return x.id===cTid;});if(tk)rMsgs(tk.messages);}
window.onNewMessage=function(id){if(cTid===id){var t=ZIT.getTickets().find(function(x){return x.id===id;});if(t)rMsgs(t.messages);}};
function doRes(){ZIT.closeTicket(cTid);var t=ZIT.getTickets().find(function(x){return x.id===cTid;});if(t){rMsgs(t.messages);document.getElementById('rBtn').style.display='none';document.getElementById('chB').innerHTML='<span class="bg b-cl">Закрыт</span>';}rList();rDash();toast('Тикет закрыт');}
function cpLnk(){try{navigator.clipboard.writeText(location.href+'#t'+cTid);}catch(e){}toast('Ссылка скопирована');}
function cAddF(fl){Array.from(fl).forEach(function(f){if(f.size>50*1024*1024)return;var r=new FileReader();r.onload=function(e){chatFs.push({name:f.name,size:f.size,dataUrl:e.target.result});document.getElementById('achp').innerHTML=chatFs.map(function(fi,i){return'<div class="achp"><i class="fas fa-paperclip"></i><span>'+ZIT.esc(fi.name)+'</span><i class="fas fa-times" onclick="chatFs.splice('+i+',1);cAddF([])"></i></div>';}).join('');};r.readAsDataURL(f);});}

function sP(el){ntPri=el.dataset.p;document.querySelectorAll('.po2').forEach(function(p){p.classList.remove('on');});el.classList.add('on');}
function dzO(e){e.preventDefault();document.getElementById('dz').classList.add('ov');}
function dzL(){document.getElementById('dz').classList.remove('ov');}
function dzD(e){e.preventDefault();dzL();ntAddF(e.dataTransfer.files);}
function ntAddF(fl){Array.from(fl).forEach(function(f){if(f.size>50*1024*1024){toast('Файл слишком большой');return;}var r=new FileReader();r.onload=function(e){ntFs.push({name:f.name,size:f.size,dataUrl:e.target.result});rDzF();};r.readAsDataURL(f);});}
function rDzF(){document.getElementById('dzF').innerHTML=ntFs.map(function(f,i){return'<div class="dzfi"><i class="fas '+fi2(f.name)+' t"></i><span>'+ZIT.esc(f.name)+'</span><i class="fas fa-times rm" onclick="ntFs.splice('+i+',1);rDzF()"></i></div>';}).join('');}
function sbT(){
  var s=document.getElementById('ntSb'),d=document.getElementById('ntDs');
  if(!s.value.trim()){s.focus();toast('Укажите тему обращения');return;}
  if(!d.value.trim()){d.focus();toast('Опишите проблему');return;}
  var r=ZIT.createTicket(CU,s.value.trim(),document.getElementById('ntCt').value,ntPri,d.value.trim(),ntFs);
  if(!r.ok)return;
  s.value='';d.value='';document.getElementById('ntCt').value='';document.getElementById('ntUr').selectedIndex=2;
  ntFs=[];document.getElementById('dzF').innerHTML='';ntPri='normal';
  document.querySelectorAll('.po2').forEach(function(p){p.classList.remove('on');});
  document.querySelector('.po2[data-p=normal]').classList.add('on');
  toast('Тикет #'+String(r.id).padStart(4,'0')+' создан');
  setTimeout(function(){oTk(r.id);},1800);
  sV('tix',null);
}

function aR(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,110)+'px';}
var tT2;
function toast(msg){clearTimeout(tT2);var el=document.getElementById('toast');document.getElementById('tMsg').textContent=msg;el.classList.add('on');tT2=setTimeout(function(){el.classList.remove('on');},3000);}

function rand2(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function fmtT2(s){return s<60?s+' сек':Math.floor(s/60)+' мин '+s%60+' сек';}
function stSt(){
  function up(){
    var n=rand2(4,6),t=rand2(40,180),l=rand2(10,90);
    var sh=ENGS.slice().sort(function(){return Math.random()-.5;}).slice(0,n);
    var ids=[['lvE',n],['swE',n],['mE',n+'/'+ENGS.length]];
    ids.forEach(function(x){var el=document.getElementById(x[0]);if(el)el.textContent=x[1];});
    var ids2=[['lvT',fmtT2(t)],['swT',fmtT2(t)],['mT',fmtT2(t)]];
    ids2.forEach(function(x){var el=document.getElementById(x[0]);if(el)el.textContent=x[1];});
    var ids3=[['lvL',l+' сек'],['swL',l+' сек']];
    ids3.forEach(function(x){var el=document.getElementById(x[0]);if(el)el.textContent=x[1];});
    var se=document.getElementById('swEs');if(se)se.innerHTML=sh.map(function(n){return'<div class="sweb">'+n+'</div>';}).join('');
  }
  up();setInterval(up,9000);
}

setInterval(function(){
  if(cTid){var t=ZIT.getTickets().find(function(x){return x.id===cTid;});if(t)rMsgs(t.messages);}
},4000);

(function(){var s=ZIT.getSession();if(s&&s.id){CU=s;stSt();sApp();}else{stSt();}})();

