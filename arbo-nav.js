(function(){'use strict';let panel=null,saved=[];
function close(){if(panel){panel.remove();panel=null;saved.forEach(({el,display})=>el.style.display=display);saved=[];}document.getElementById('arbo-nav-button')?.removeAttribute('aria-current');}
function install(){const side=document.querySelector('.imis-sidebar'),main=document.querySelector('.imis-main');if(!side||!main||document.getElementById('arbo-nav-button'))return;
const prototype=side.querySelector('button');if(!prototype)return;
const button=document.createElement('button');button.id='arbo-nav-button';button.className=prototype.className;button.style.cssText=prototype.style.cssText;button.style.width='100%';button.style.whiteSpace='normal';button.style.textAlign='left';button.textContent='Agrarian Reform Beneficiaries Organizations';
button.onclick=()=>{close();saved=[...main.children].map(el=>({el,display:el.style.display}));saved.forEach(({el})=>el.style.display='none');panel=document.createElement('iframe');panel.src='arbo-map.html';panel.title='Agrarian Reform Beneficiaries Organizations';panel.style.cssText='width:100%;height:calc(100vh - 60px);min-height:720px;border:0';main.appendChild(panel);button.setAttribute('aria-current','page');};
(document.getElementById('gis-nav-group')||side).appendChild(button);
side.addEventListener('click',event=>{const target=event.target.closest('button');if(target&&target!==button)close();},true);
}
new MutationObserver(install).observe(document.documentElement,{subtree:true,childList:true});install();
})();
