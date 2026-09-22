/* Presentation enhancements; no database or authentication operations. */
(() => {
  productColors.splice(0,productColors.length,'#50866b','#bfa267','#849ea5','#9c8cab','#bf8970','#a2b17f','#567b79','#879085');
  const paths = {
    gem:'<path d="m12 3 9 7-9 11L3 10l9-7Z"/><path d="M3 10h18M12 3l4 7-4 11-4-11 4-7Z"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    plus:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8m-4-4h8"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert:'<path d="m10.3 3.9-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--green-900)"/><circle cx="15" cy="17" r="3" fill="var(--green-900)"/>',
    wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 6h3"/>',
    chart:'<path d="M4 20h16M7 16v-5m5 5V5m5 11V8"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:'<path d="m3 3 18 18M10.6 5.1 12 5c6.4 0 10 7 10 7a20 20 0 0 1-3 3.8M6.1 6.1A22 22 0 0 0 2 12s3.6 7 10 7c2 0 3.8-.7 5.3-1.7"/>',
    logout:'<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = name => '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">'+paths[name]+'</svg>';
  const setIcon = (selector,name) => document.querySelectorAll(selector).forEach(el => {el.innerHTML=icon(name);});
  setIcon('.side-logo, .login-brand-mark','gem');
  const navigation = {dashboard:'grid',input:'plus',mulia:'users',kol1:'shield',lar:'clock',npl:'alert',archive:'file',settings:'settings'};
  Object.entries(navigation).forEach(([page,name]) => setIcon('.nav-item[data-page="'+page+'"] .nav-icon',name));
  setIcon('.stat-card.blue .stat-icon','users');
  setIcon('.stat-card.green .stat-icon','wallet');
  setIcon('.stat-card.purple .stat-icon','chart');
  setIcon('.stat-card.amber .stat-icon','file');
  setIcon('.count-icon','clock');
  setIcon('#mobileMenuBtn','menu');
  setIcon('#logoutBtn','logout');
  setIcon('.login-form label:first-child .login-input-wrap>span','user');
  setIcon('.login-form label:nth-child(2) .login-input-wrap>span','lock');
  const passwordButton=document.getElementById('togglePasswordBtn');
  const updatePasswordIcon=()=> {
    const shown=document.getElementById('loginPassword').type==='text';
    passwordButton.innerHTML=icon(shown?'eyeOff':'eye');
    passwordButton.setAttribute('aria-pressed',String(shown));
  };
  updatePasswordIcon();
  passwordButton.addEventListener('click',updatePasswordIcon);
  const form=document.getElementById('loginForm');
  const submit=form.querySelector('[type="submit"]');
  new MutationObserver(()=> {
    submit.querySelector('span').textContent=submit.disabled?'Sedang masuk…':'Masuk Dashboard';
    form.setAttribute('aria-busy',String(submit.disabled));
  }).observe(submit,{attributes:true,attributeFilter:['disabled']});
  const sidebar=document.getElementById('sidebar');
  const menu=document.getElementById('mobileMenuBtn');
  new MutationObserver(()=> {
    const open=sidebar.classList.contains('open');
    menu.setAttribute('aria-expanded',String(open));
    if(open) sidebar.querySelector('.nav-item.active')?.focus();
    else if(sidebar.contains(document.activeElement)) menu.focus();
  }).observe(sidebar,{attributes:true,attributeFilter:['class']});
  document.querySelectorAll('.nav-item').forEach(item=>{
    const update=()=>item.classList.contains('active')?item.setAttribute('aria-current','page'):item.removeAttribute('aria-current');
    update();
    new MutationObserver(update).observe(item,{attributes:true,attributeFilter:['class']});
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!sidebar.classList.contains('open')||!window.matchMedia('(max-width:900px)').matches) return;
    const buttons=[...sidebar.querySelectorAll('button')].filter(button=>button.getClientRects().length&&!button.disabled);
    const first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
})();

