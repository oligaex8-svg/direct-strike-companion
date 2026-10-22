'use strict';

// Move existing controls once, retaining their IDs, state and event listeners.
(()=>{
 const heading=document.querySelector('.page-head>div:first-child');
 const description=heading?.querySelector('p.muted');
 if(description){
  heading.classList.add('page-heading');
  description.hidden=true;
 }
 // Retain the old update targets for the existing renderer, outside the UI.
 // Sound previews live in Sounds; profile results already have their own page.
 const retired=document.createElement('div');retired.hidden=true;
 retired.className='retired-header-tools';
 for(const node of [document.getElementById('notify-test'),document.querySelector('main .metrics'),document.querySelector('main>footer>.muted')])if(node)retired.append(node);
 document.body.append(retired);
 // Settings is a short task index; keep the existing form inputs connected.
 const settings=document.getElementById('settings-form');
 if(settings){
  const field=id=>settings.querySelector('#'+id),label=id=>settings.querySelector(`label[for="${id}"]`);
  const folders=field('folders'),self=field('self-ids'),auto=field('auto-detect-self')?.closest('label'),watch=field('live-watch')?.closest('label');
  const scanHelp=watch?.nextElementSibling;
  const group=(title,nodes)=>{
   const detail=document.createElement('details');detail.className='settings-group';
   const summary=document.createElement('summary');summary.textContent=title;detail.append(summary);
   for(const node of nodes.filter(Boolean))detail.append(node);
   settings.insertBefore(detail,settings.querySelector(':scope>.dialog-actions'));return detail;
  };
  group('Replay folders and monitoring',[label('folders'),folders,watch,scanHelp]);
  group('Your accounts',[settings.querySelector('.own-manual'),label('self-ids'),self,auto,auto?.nextElementSibling,field('own-accounts-settings')]);
  group('Game controls',[settings.querySelector('.sc2-automation-settings')]);
  const shortcuts=document.createElement('div');shortcuts.className='settings-shortcuts';
  for(const item of [...settings.querySelectorAll(':scope>.settings-sound-link')])shortcuts.append(item);
  settings.insertBefore(shortcuts,settings.querySelector('.settings-group'));
  group('Storage details',[field('data-path')]);
 }
 const footnote=document.querySelector('.library>.footnote');
 if(footnote){
  const guide=document.createElement('details');guide.className='directory-guide';
  const summary=document.createElement('summary');summary.textContent='Column guide';
  footnote.before(guide);guide.append(summary,footnote);
 }
})();
