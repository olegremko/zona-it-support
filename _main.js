
const PAGES=['home','service-pc','service-servers','service-network','service-1c','service-security','service-kassa','about','team','cases','blog','vacancies','partners','faq','privacy','terms'];

function nav(route,anchor){
  PAGES.forEach(function(p){var el=document.getElementById('page-'+p);if(el)el.style.display='none';});
  var t=document.getElementById('page-'+route);
  if(t){t.style.display='block';window.scrollTo(0,0);try{history.pushState(null,'','#'+route);}catch(e){}
    if(anchor){setTimeout(function(){var a=document.getElementById(anchor);if(a)a.scrollIntoView({behavior:'smooth'});},120);}
  }
}
window.addEventListener('popstate',function(){var h=location.hash.replace('#','')||'home';if(PAGES.indexOf(h)===-1)h='home';nav(h);});

// ===== NAV SCROLL =====
window.addEventListener('scroll',function(){document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>40);});

// ===== NAV DROPDOWN DELAY =====
var timers=new WeakMap();

// ===== STATUS UPDATE =====
var engNames=['Алексей С.','Дмитрий К.','Мария В.','Иван Р.','Елена Т.','Сергей Н.'];
function randomBetween(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function formatTime(s){return s<60?s+' сек':Math.floor(s/60)+' мин '+s%60+' сек';}
function updateStatus(){
  var e=document.getElementById('eng-count');if(!e)return;
  var c=randomBetween(4,6);
  e.textContent=c+' инженеров';
  document.getElementById('resp-time').textContent=formatTime(randomBetween(30,220));
  document.getElementById('last-req').textContent=randomBetween(10,120)+' сек назад';
  var s=engNames.slice().sort(function(){return Math.random()-.5;}).slice(0,c);
  document.getElementById('eng-badges').innerHTML=s.map(function(n){return '<div class="eng-badge"><i class="fas fa-circle" style="font-size:6px"></i> '+n+'</div>';}).join('');
}
setInterval(updateStatus,10000);

// ===== TICKET TIMER =====
var ticketSec=723;
setInterval(function(){
  ticketSec++;var m=Math.floor(ticketSec/60),s=ticketSec%60;
  var el=document.getElementById('ticket-time');
  if(el)el.textContent=m+' мин '+(s<10?'0':'')+s+' сек';
},1000);

// ===== SLIDER =====
function updateSliderFill(el){var p=((el.value-el.min)/(el.max-el.min))*100;el.style.setProperty('--val',p+'%');}

// ===== CALCULATOR =====
var scenario=0;
function setScenario(el,idx){
  document.querySelectorAll('.scenario-item').forEach(function(i){i.classList.remove('active');});
  el.classList.add('active');scenario=idx;
  var sg=document.getElementById('server-group'),br=document.getElementById('b-srv-row');
  if(idx===0){sg.style.display='none';br.style.display='none';}
  else{sg.style.display='block';br.style.display='flex';}
  updateCalc();
}
function fmt(n){return n.toLocaleString('ru-RU');}
function updateCalc(){
  var emp=document.getElementById('emp-slider'),srv=document.getElementById('srv-slider');
  if(!emp)return;
  var e=+emp.value,s=+srv.value;
  document.getElementById('emp-val').textContent=e;
  document.getElementById('srv-val').textContent=s;
  updateSliderFill(emp);updateSliderFill(srv);
  var pc=0,sc=0,base=[1500,2000,2500,0][scenario];
  pc=e*base+(scenario===2?15000:0);
  if(scenario>0)sc=s*4000+(scenario===2?12000:0);
  var total=pc+sc+5000+3000;
  document.getElementById('total-num').textContent=fmt(total);
  document.getElementById('b-pc').textContent=fmt(pc)+' \u20bd';
  document.getElementById('b-srv').textContent=fmt(sc)+' \u20bd';
  document.getElementById('b-1c').textContent=fmt(5000)+' \u20bd';
  document.getElementById('b-net').textContent=fmt(3000)+' \u20bd';
  document.getElementById('discount-sum').textContent=fmt(Math.round(total*12*0.1));
}

// ===== FILTER TABLE =====
function filterTable(v){document.querySelectorAll('.pricing-table tbody tr').forEach(function(r){r.classList.toggle('hidden',v!=='all'&&!(r.dataset.industry||'').includes(v));});}

// ===== PLAN BUILDER =====
var bOpts=0;
function toggleOption(el,price){
  if(el.classList.contains('checked')){el.classList.remove('checked');el.querySelector('.option-check').textContent='';bOpts-=price;}
  else{el.classList.add('checked');el.querySelector('.option-check').textContent='\u2713';bOpts+=price;}
  updateBuilder();
}
var planDescs={9900:'<strong>\u0411\u0430\u0437\u043e\u0432\u044b\u0439</strong> \u2014 \u0440\u0435\u0430\u043a\u0446\u0438\u044f 4 \u0447\u0430\u0441\u0430, 2 \u0432\u044b\u0435\u0437\u0434\u0430, \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0435 \u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435.',24900:'<strong>\u041e\u043f\u0442\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0439</strong> \u2014 \u0440\u0435\u0430\u043a\u0446\u0438\u044f 1 \u0447\u0430\u0441, \u043d\u0435\u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043d\u044b\u0435 \u0432\u044b\u0435\u0437\u0434\u044b, \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 24/7, SLA.',49900:'<strong>\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439</strong> \u2014 \u0440\u0435\u0430\u043a\u0446\u0438\u044f 15 \u043c\u0438\u043d, \u043e\u0431\u043b\u0430\u043a\u043e, SLA 99.9%.'};
function updateBuilder(){var b=+document.getElementById('base-plan').value;document.getElementById('plan-desc').innerHTML=planDescs[b];document.getElementById('builder-total').textContent=fmt(b+bOpts);}

// ===== FILTER CASES =====
function filterCases(cat,btn){
  document.querySelectorAll('.filter-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('#cases-grid .case-card').forEach(function(c){c.style.display=(cat==='all'||c.dataset.cat===cat)?'block':'none';});
}

// ===== CASE MODAL =====
var casesData=[
  {title:'\u041e\u041e\u041e \u00ab\u041c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442-\u042e\u0433\u00bb',desc:'180 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432, 7 \u043b\u0435\u0442 \u0431\u0435\u0437 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f.',beforeStat:'12 \u0447/\u043d\u0435\u0434',beforeDesc:'\u043f\u0440\u043e\u0441\u0442\u043e\u0435\u0432 \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0430',afterStat:'4 \u0447/\u043d\u0435\u0434',afterDesc:'\u043f\u043e\u0441\u043b\u0435 \u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u044f \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433\u0430'},
  {title:'\u0421\u0435\u0442\u044c \u00ab\u0423\u044e\u0442\u043d\u044b\u0439 \u0434\u043e\u043c\u00bb',desc:'14 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u043e\u0432, \u0441\u0431\u043e\u0438 \u043a\u0430\u0441\u0441.',beforeStat:'8 \u0441\u0431\u043e\u0435\u0432',beforeDesc:'\u0432 \u043c\u0435\u0441\u044f\u0446',afterStat:'0 \u0441\u0431\u043e\u0435\u0432',afterDesc:'100% \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0441\u0442\u044c'},
  {title:'\u041a\u043b\u0438\u043d\u0438\u043a\u0430 \u00ab\u0417\u0434\u043e\u0440\u043e\u0432\u044c\u0435 \u043f\u043b\u044e\u0441\u00bb',desc:'\u041c\u0418\u0421 \u0433\u0440\u0443\u0437\u0438\u043b\u0430\u0441\u044c 40 \u0441\u0435\u043a.',beforeStat:'40 \u0441\u0435\u043a',beforeDesc:'\u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438',afterStat:'12 \u0441\u0435\u043a',afterDesc:'\u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u0442\u0438\u043c\u0438\u0437\u0430\u0446\u0438\u0438'},
  {title:'\u0422\u042d\u041a \u00ab\u0420\u0443\u0441\u041b\u043e\u0433\u0438\u0441\u0442\u0438\u043a\u00bb',desc:'3 \u0441\u043a\u043b\u0430\u0434\u0430, 120 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432.',beforeStat:'47/\u043c\u0435\u0441',beforeDesc:'\u0438\u043d\u0446\u0438\u0434\u0435\u043d\u0442\u043e\u0432',afterStat:'18/\u043c\u0435\u0441',afterDesc:'\u043f\u043e\u0441\u043b\u0435 \u0430\u0443\u0434\u0438\u0442\u0430'}
];
function openCase(idx){
  var d=casesData[idx];
  document.getElementById('modal-title').textContent=d.title;
  document.getElementById('modal-desc').textContent=d.desc;
  document.getElementById('modal-before-stat').textContent=d.beforeStat;
  document.getElementById('modal-before-desc').textContent=d.beforeDesc;
  document.getElementById('modal-after-stat').textContent=d.afterStat;
  document.getElementById('modal-after-desc').textContent=d.afterDesc;
  document.getElementById('caseModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(){document.getElementById('caseModal').classList.remove('open');document.body.style.overflow='';}

// ===== EXIT POPUP =====
var exitShown=false;
document.addEventListener('mouseleave',function(e){if(e.clientY<=0&&!exitShown){exitShown=true;document.getElementById('exitPopup').classList.add('show');}});
function closeExit(){document.getElementById('exitPopup').classList.remove('show');}

// ===== CHATBOT =====




function toggleChat(){openChat();}




// ===== SIDEBAR / FAQ =====



// ===== SERVICE PANEL =====
var _si=0,spd=[
  {i:'<i class="fas fa-desktop"></i>',g:'\u0420\u0430\u0431\u043e\u0447\u0438\u0435 \u043c\u0435\u0441\u0442\u0430',t:'\u041e\u0431\u0441\u043b\u0443\u0436\u0438\u0432\u0430\u043d\u0438\u0435 \u041f\u041a',s:'\u041f\u043e\u043b\u043d\u043e\u0435 \u0441\u043e\u043f\u0440\u043e\u0432\u043e\u0436\u0434\u0435\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0447\u0438\u0445 \u043c\u0435\u0441\u0442',n:[{n:'200+',l:'\u041f\u041a'},{n:'< 1 \u0447',l:'\u0432\u0440\u0435\u043c\u044f \u0440\u0435\u0448\u0435\u043d\u0438\u044f'},{n:'99.4%',l:'uptime'}],d:'\u041f\u043e\u043b\u043d\u044b\u0439 \u0446\u0438\u043a\u043b \u043e\u0431\u0441\u043b\u0443\u0436\u0438\u0432\u0430\u043d\u0438\u044f \u0440\u0430\u0431\u043e\u0447\u0438\u0445 \u043c\u0435\u0441\u0442 \u2014 \u043e\u0442 \u0434\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0438 \u0434\u043e \u0437\u0430\u043c\u0435\u043d\u044b \u043a\u043e\u043c\u043f\u043e\u043d\u0435\u043d\u0442\u043e\u0432.',l:['\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 24/7','\u041f\u0440\u043e\u0444\u0438\u043b\u0430\u043a\u0442\u0438\u043a\u0430','\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u041f\u041e','\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u043e\u0435 \u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435','\u0417\u0430\u043c\u0435\u043d\u0430 \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0443\u044e\u0449\u0438\u0445'],p:[{t:'\u0417\u0430\u044f\u0432\u043a\u0430',d:'\u0427\u0435\u0440\u0435\u0437 \u043f\u043e\u0440\u0442\u0430\u043b \u0438\u043b\u0438 Telegram'},{t:'\u0414\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u0430',d:'\u0423\u0434\u0430\u043b\u0451\u043d\u043d\u043e \u0437\u0430 15 \u043c\u0438\u043d'},{t:'\u0420\u0435\u0448\u0435\u043d\u0438\u0435',d:'\u0423\u0434\u0430\u043b\u0451\u043d\u043d\u043e \u0438\u043b\u0438 \u0432\u044b\u0435\u0437\u0434'},{t:'\u041e\u0442\u0447\u0451\u0442',d:'\u0417\u0430\u043a\u0440\u044b\u0442\u0438\u0435 \u0441 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435\u043c'}],a:[{p:'\u0420\u0435\u0430\u043a\u0446\u0438\u044f',v:'15 \u043c\u0438\u043d'},{p:'\u0420\u0435\u0448\u0435\u043d\u0438\u0435',v:'\u0434\u043e 1 \u0447'},{p:'\u0412\u044b\u0435\u0437\u0434',v:'\u0434\u043e 4 \u0447'},{p:'\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0441\u0442\u044c',v:'24/7/365'}],r:'service-pc'},
  {i:'<i class="fas fa-server"></i>',g:'\u0421\u0435\u0440\u0432\u0435\u0440\u044b',t:'\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u0432',s:'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u043d\u043e\u0439 \u0438\u043d\u0444\u0440\u0430\u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u044b',n:[{n:'50+',l:'\u0441\u0435\u0440\u0432\u0435\u0440\u043e\u0432'},{n:'99.9%',l:'uptime'},{n:'< 15 \u043c\u0438\u043d',l:'\u0440\u0435\u0430\u043a\u0446\u0438\u044f'}],d:'\u0411\u0435\u0441\u043f\u0435\u0440\u0435\u0431\u043e\u0439\u043d\u0430\u044f \u0440\u0430\u0431\u043e\u0442\u0430 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043a\u0438\u0445 \u0438 \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0445 \u0441\u0435\u0440\u0432\u0435\u0440\u043e\u0432.',l:['\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433','\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u043e\u0435 \u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435','\u0412\u0438\u0440\u0442\u0443\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f','\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0411\u0414'],p:[{t:'\u0410\u0443\u0434\u0438\u0442',d:'\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'},{t:'\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433',d:'\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u0430\u043b\u0435\u0440\u0442\u043e\u0432'},{t:'\u0422\u041e',d:'\u0415\u0436\u0435\u043d\u0435\u0434\u0435\u043b\u044c\u043d\u043e'},{t:'\u0418\u043d\u0446\u0438\u0434\u0435\u043d\u0442\u044b',d:'\u0420\u0435\u0430\u043a\u0446\u0438\u044f \u0437\u0430 15 \u043c\u0438\u043d'}],a:[{p:'\u041a\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0438\u043d\u0446\u0438\u0434\u0435\u043d\u0442',v:'15 \u043c\u0438\u043d'},{p:'Uptime',v:'99.9%'},{p:'\u041a\u043e\u043f\u0438\u0438',v:'30 \u0434\u043d\u0435\u0439'}],r:'service-servers'},
  {i:'<i class="fas fa-network-wired"></i>',g:'\u0421\u0435\u0442\u0438',t:'\u041a\u043e\u0440\u043f\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u0441\u0435\u0442\u0438',s:'\u041f\u0440\u043e\u0435\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0438 \u043e\u0431\u0441\u043b\u0443\u0436\u0438\u0432\u0430\u043d\u0438\u0435',n:[{n:'100+',l:'\u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432'},{n:'10 \u0413\u0431\u0438\u0442/\u0441',l:'\u0441\u043a\u043e\u0440\u043e\u0441\u0442\u044c'},{n:'24/7',l:'\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433'}],d:'Cisco, MikroTik, Ubiquiti. Wi-Fi, VPN, VLAN, firewall.',l:['\u041f\u0440\u043e\u0435\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435','\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0446\u0438\u044f','Wi-Fi','VPN','\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433'],p:[{t:'\u041e\u0431\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435',d:'\u0410\u043d\u0430\u043b\u0438\u0437 \u043f\u043e\u043c\u0435\u0449\u0435\u043d\u0438\u0439'},{t:'\u041f\u0440\u043e\u0435\u043a\u0442',d:'\u0422\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u0435'},{t:'\u041c\u043e\u043d\u0442\u0430\u0436',d:'\u0421\u041a\u0421 \u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430'},{t:'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430',d:'\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 24/7'}],a:[{p:'\u0421\u0431\u043e\u0439 \u0441\u0435\u0442\u0438',v:'30 \u043c\u0438\u043d'},{p:'\u0413\u0430\u0440\u0430\u043d\u0442\u0438\u044f',v:'1 \u0433\u043e\u0434'}],r:'service-network'},
  {i:'<i class="fas fa-database"></i>',g:'1\u0421 \u0438 ERP',t:'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0438 \u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0435 1\u0421',s:'\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442\u044b 1\u0421',n:[{n:'80+',l:'\u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0439'},{n:'< 30 \u043c\u0438\u043d',l:'\u0440\u0435\u0430\u043a\u0446\u0438\u044f'},{n:'100%',l:'\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439'}],d:'1\u0421:\u041f\u0440\u0435\u0434\u043f\u0440\u0438\u044f\u0442\u0438\u0435 8.3: \u0411\u0443\u0445\u0433\u0430\u043b\u0442\u0435\u0440\u0438\u044f, \u0423\u0422, \u0417\u0423\u041f, ERP. \u0412\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0435, \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430, \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438.',l:['\u0412\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0435 \u0441 \u043d\u0443\u043b\u044f','\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f','\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f \u0441 \u043a\u0430\u0441\u0441\u0430\u043c\u0438','\u041e\u0431\u0443\u0447\u0435\u043d\u0438\u0435','\u0422\u0435\u0445\u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 24/7'],p:[{t:'\u0410\u043d\u0430\u043b\u0438\u0437',d:'\u0411\u0438\u0437\u043d\u0435\u0441-\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u044b'},{t:'\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u043a\u0430',d:'\u041f\u043b\u0430\u0442\u0444\u043e\u0440\u043c\u0430, \u041d\u0421\u0418, \u043f\u0440\u0430\u0432\u0430'},{t:'\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438',d:'\u041a\u0430\u0441\u0441\u044b, \u0415\u0413\u0410\u0418\u0421, CRM'},{t:'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430',d:'\u041e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u0438 \u043f\u043e\u043c\u043e\u0449\u044c'}],a:[{p:'\u0421\u0431\u043e\u0439 1\u0421',v:'30 \u043c\u0438\u043d'},{p:'\u041a\u043e\u043f\u0438\u044f \u0431\u0430\u0437\u044b',v:'\u0435\u0436\u0435\u0434\u043d\u0435\u0432\u043d\u043e'},{p:'\u0422\u0435\u0441\u0442 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0439',v:'\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e'}],r:'service-1c'},
  {i:'<i class="fas fa-shield-alt"></i>',g:'\u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c',t:'\u0417\u0430\u0449\u0438\u0442\u0430 \u0434\u0430\u043d\u043d\u044b\u0445',s:'\u041a\u043e\u043c\u043f\u043b\u0435\u043a\u0441\u043d\u0430\u044f \u0418\u0411: \u0430\u0443\u0434\u0438\u0442, \u0437\u0430\u0449\u0438\u0442\u0430, \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433',n:[{n:'0',l:'\u0430\u0442\u0430\u043a \u0443 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432'},{n:'150+',l:'\u0430\u0443\u0434\u0438\u0442\u043e\u0432 \u0418\u0411'},{n:'1 \u0447',l:'\u0440\u0435\u0430\u043a\u0446\u0438\u044f'}],d:'\u0410\u043d\u0442\u0438\u0432\u0438\u0440\u0443\u0441, DLP, firewall, SIEM. 152-\u0424\u0417.',l:['\u0410\u0443\u0434\u0438\u0442 \u0418\u0411','\u0410\u043d\u0442\u0438\u0432\u0438\u0440\u0443\u0441','DLP','Firewall','SIEM'],p:[{t:'\u0410\u0443\u0434\u0438\u0442',d:'\u0423\u044f\u0437\u0432\u0438\u043c\u043e\u0441\u0442\u0438'},{t:'\u041f\u043e\u043b\u0438\u0442\u0438\u043a\u0438',d:'\u0420\u0435\u0433\u043b\u0430\u043c\u0435\u043d\u0442\u044b'},{t:'\u0412\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u0435',d:'\u0421\u0440\u0435\u0434\u0441\u0442\u0432\u0430 \u0437\u0430\u0449\u0438\u0442\u044b'},{t:'\u041c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433',d:'\u0420\u0435\u0430\u0433\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u0430 \u0438\u043d\u0446\u0438\u0434\u0435\u043d\u0442\u044b'}],a:[{p:'\u0418\u043d\u0446\u0438\u0434\u0435\u043d\u0442 \u0418\u0411',v:'1 \u0447'},{p:'152-\u0424\u0417',v:'\u0433\u0430\u0440\u0430\u043d\u0442\u0438\u0440\u0443\u0435\u043c'}],r:'service-security'},
  {i:'<i class="fas fa-cash-register"></i>',g:'\u041a\u0430\u0441\u0441\u044b',t:'\u041a\u0430\u0441\u0441\u044b \u0438 \u0442\u043e\u0440\u0433\u043e\u0432\u043e\u0435 \u043e\u0431\u043e\u0440\u0443\u0434\u043e\u0432\u0430\u043d\u0438\u0435',s:'54-\u0424\u0417, \u0410\u0422\u041e\u041b, \u042d\u0432\u043e\u0442\u043e\u0440, \u0414\u0440\u0438\u043c\u043a\u0430\u0441',n:[{n:'500+',l:'\u043a\u0430\u0441\u0441'},{n:'60 \u043c\u0438\u043d',l:'\u0432\u044b\u0435\u0437\u0434'},{n:'100%',l:'\u0421\u041e\u041e\u0422\u0412\u0415\u0422\u0421\u0422\u0412\u0418\u0415'}],d:'\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u0432 \u0424\u041d\u0421, \u041e\u0424\u0414, \u0437\u0430\u043c\u0435\u043d\u0430 \u0424\u041d, \u0415\u0413\u0410\u0418\u0421, \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f \u0441 1\u0421.',l:['\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u041a\u041a\u0422','\u0417\u0430\u043c\u0435\u043d\u0430 \u0424\u041d','\u0415\u0413\u0410\u0418\u0421/\u041c\u0435\u0440\u043a\u0443\u0440\u0438\u0439','\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f \u0441 1\u0421','\u042d\u043a\u0441\u0442\u0440\u0435\u043d\u043d\u044b\u0439 \u0432\u044b\u0435\u0437\u0434'],p:[{t:'\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f',d:'\u0424\u041d\u0421, \u041e\u0424\u0414'},{t:'\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044f',d:'1\u0421, \u0415\u0413\u0410\u0418\u0421'},{t:'\u041e\u0431\u0443\u0447\u0435\u043d\u0438\u0435',d:'\u041a\u0430\u0441\u0441\u0438\u0440\u044b'},{t:'\u0422\u041e',d:'\u041f\u043b\u0430\u043d\u043e\u0432\u043e\u0435 2 \u0440\u0430\u0437\u0430 \u0432 \u0433\u043e\u0434'}],a:[{p:'\u0412\u044b\u0435\u0437\u0434',v:'60 \u043c\u0438\u043d'},{p:'\u0417\u0430\u043c\u0435\u043d\u0430 \u0424\u041d',v:'\u0432 \u0434\u0435\u043d\u044c'},{p:'\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430',v:'24/7'}],r:'service-kassa'}
];

function openService(idx){
  _si=idx;var d=spd[idx],o=document.getElementById('svcPanel');
  document.getElementById('sp-icon').innerHTML=d.i;
  document.getElementById('sp-tag').textContent=d.g;
  document.getElementById('sp-title').textContent=d.t;
  document.getElementById('sp-subtitle').textContent=d.s;
  document.getElementById('sp-stats').innerHTML=d.n.map(function(s){return '<div class="svc-stat"><div class="svc-stat-num">'+s.n+'</div><div class="svc-stat-label">'+s.l+'</div></div>';}).join('');
  document.getElementById('sp-desc').textContent=d.d;
  document.getElementById('sp-list').innerHTML=d.l.map(function(x){return '<div class="svc-full-item"><div class="svc-full-item-icon"><i class="fas fa-check"></i></div><div class="svc-full-item-text">'+x+'</div></div>';}).join('');
  document.getElementById('sp-process').innerHTML=d.p.map(function(s,i){return '<div class="proc-step"><div class="proc-left"><div class="proc-num">'+(i+1)+'</div><div class="proc-line"></div></div><div class="proc-body"><div class="proc-title">'+s.t+'</div><div class="proc-desc">'+s.d+'</div></div></div>';}).join('');
  document.getElementById('sp-sla-body').innerHTML=d.a.map(function(r){return '<tr><td>'+r.p+'</td><td class="sla-val">'+r.v+'</td></tr>';}).join('');
  o.classList.add('open');document.body.style.overflow='hidden';
  o.querySelector('.svc-panel-body').scrollTop=0;
}
function closeService(){document.getElementById('svcPanel').classList.remove('open');document.body.style.overflow='';}
function openServicePage(){var r=spd[_si].r;closeService();nav(r);}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeService();closeModal();}});

// ===== INIT =====


// ===== CONSENT CHECKBOX =====






// ── Chat integration ──────────────────────────────────────────────

// ── Nav dropdown delay (WeakMap approach) ────────────────────────

// ── Consent ──────────────────────────────────────────────────────


  // Sliders init
  document.querySelectorAll('input[type=range]').forEach(function(el){
    updateSliderFill(el);
    el.addEventListener('input',function(){updateSliderFill(el);});
  });

  // Calculator init
  var sg=document.getElementById('server-group'),br=document.getElementById('b-srv-row');
  if(sg)sg.style.display='none';
  if(br)br.style.display='none';
  updateCalc();

  // Case modal close on backdrop
  var cm=document.getElementById('caseModal');
  if(cm)cm.addEventListener('click',function(e){if(e.target===this)closeModal();});

  // CW widget auto-login check
  try{
    var saved=localStorage.getItem('zonait_user');
  }catch(e){}

  // Router: show correct page
  var h=location.hash.replace('#','')||'home';
  if(PAGES.indexOf(h)===-1)h='home';
  nav(h);
  document.querySelectorAll('.nav-item').forEach(function(item){
  // ── Router init ──
  var h=location.hash.replace('#','')||'home';
  if(typeof PAGES!=='undefined'&&PAGES.indexOf(h)===-1) h='home';
  if(typeof nav==='function') nav(h);
});

// ===== NAV DROPDOWN HOVER DELAY =====
document.addEventListener('DOMContentLoaded', function() {
  // Nav hover delay
  var ndTimers = {};
  document.querySelectorAll('.nav-item').forEach(function(item) {
    item.addEventListener('mouseenter', function() {
      clearTimeout(ndTimers[item]);
    });
    item.addEventListener('mouseleave', function() {
      ndTimers[item] = setTimeout(function() { /* CSS handles it */ }, 400);
    });
  });

  // Sliders
  document.querySelectorAll('input[type=range]').forEach(function(el) {
    updateSliderFill(el);
    el.addEventListener('input', function() { updateSliderFill(el); });
  });

  // Calculator defaults
  var sg = document.getElementById('server-group');
  var br = document.getElementById('b-srv-row');
  if (sg) sg.style.display = 'none';
  if (br) br.style.display = 'none';
  updateCalc();

  // Case modal
  var cm = document.getElementById('caseModal');
  if (cm) cm.addEventListener('click', function(e) { if (e.target === this) closeModal(); });

  // Router init
  var h = location.hash.replace('#', '') || 'home';
  if (PAGES.indexOf(h) === -1) h = 'home';
  nav(h);
});

// ===== CHAT BUTTON =====
function openChat() {
  window.open('zona-it-chat.html', '_blank',
    'width=400,height=640,left=' + (screen.width - 420) +
    ',top=' + (screen.height - 680) +
    ',resizable=yes,scrollbars=no');
}

// ===== CONSENT =====
function toggleConsent(boxId, errId) {
  var b = document.getElementById(boxId);
  var e = document.getElementById(errId);
  b.classList.toggle('checked');
  b.classList.remove('err');
  if (e) e.classList.remove('show');
}
function submitForm(boxId, errId, cb) {
  var b = document.getElementById(boxId);
  var e = document.getElementById(errId);
  if (!b.classList.contains('checked')) {
    b.classList.add('err');
    if (e) e.classList.add('show');
    b.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  if (cb) cb();
  return true;
}
function toggleFaq(el) { el.closest('.faq-item').classList.toggle('open'); }
function toggleHelper() { document.getElementById('helperForm').classList.toggle('open'); }


