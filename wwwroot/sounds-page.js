'use strict';

// Browsing preferences never enter the persisted notification preferences.
const soundsPageState={target:'default',language:'en',category:'',search:'',initialized:false,previewing:'',previewError:''};
const soundsPageStorageKey='ds-companion:sounds-browser';
function soundsPageLanguage(recording){return recording?.language==='ru'?'ru':'en';}
function soundsPageInterface(){return typeof interfaceLanguage==='string'&&interfaceLanguage==='ru'?'ru':'en';}
function soundsPageText(text){return typeof translateInterfaceText==='function'?translateInterfaceText(text):text;}
function soundsPageRecording(preset){return starcraftSoundLibrary.sounds.find(sound=>sound.preset===preset);}
function soundsPageAssigned(options=liveGameSoundOptions(),target=soundsPageState.target){return target==='default'?options.preset:options.styles?.[target]||options.preset;}
function soundsPageName(recording){return recording?.[soundsPageInterface()]||recording?.en||'';}
function soundsPageCategoryName(category){return (category?.[soundsPageInterface()]||category?.en||'').replace(/^Russian · |^Русские · /,'').replace('StarCraft I · ','SC1 · ').replace('StarCraft II · ','SC2 · ');}
function soundsPageCategories(language=soundsPageState.language){
 return starcraftSoundLibrary.categories.filter(category=>starcraftSoundLibrary.sounds.some(sound=>sound.category===category.key&&soundsPageLanguage(sound)===language));
}
function soundsPageRecordings(language=soundsPageState.language,category=soundsPageState.category,search=soundsPageState.search){
 const query=search.trim().toLocaleLowerCase();
 return starcraftSoundLibrary.sounds.filter(sound=>soundsPageLanguage(sound)===language&&(!category||sound.category===category)&&(!query||[sound.en,sound.ru,soundsPageCategoryName(starcraftSoundLibrary.categories.find(item=>item.key===sound.category))].some(label=>String(label||'').toLocaleLowerCase().includes(query))));
}
function initializeSoundsPage(){
 if(soundsPageState.initialized)return;
 soundsPageState.initialized=true;
 soundsPageState.language=soundsPageLanguage(soundsPageRecording(soundsPageAssigned()));
 try{
  const saved=JSON.parse(localStorage.getItem(soundsPageStorageKey)||'null');
  if(saved?.language==='en'||saved?.language==='ru')soundsPageState.language=saved.language;
  if(typeof saved?.category==='string'&&soundsPageCategories().some(category=>category.key===saved.category))soundsPageState.category=saved.category;
 }catch{/* Private browsing and disabled storage still allow sound selection. */}
}
function saveSoundsPageFilters(){
 try{localStorage.setItem(soundsPageStorageKey,JSON.stringify({language:soundsPageState.language,category:soundsPageState.category}));}catch{/* Filters remain available for this session. */}
}
function setSoundsPageFilter(kind,value){
 if(kind==='language'&&(value==='en'||value==='ru')){
  soundsPageState.language=value;
  if(!soundsPageCategories().some(category=>category.key===soundsPageState.category))soundsPageState.category='';
 }else if(kind==='category'&&(!value||soundsPageCategories().some(category=>category.key===value)))soundsPageState.category=value;
 else if(kind==='search')soundsPageState.search=value;
 else return;
 if(kind!=='search')saveSoundsPageFilters();
}
async function assignSoundsPageRecording(preset){
 if(liveGameSoundSaving||liveCustomSoundBusy||!soundsPageRecording(preset))return;
 const focused=document.activeElement;
 try{
  if(soundsPageState.target==='default')await saveLiveGameSound('preset',preset);
  else await saveLiveGameSound('styles',{...liveGameSoundOptions().styles,[soundsPageState.target]:preset});
 }finally{restoreSoundsPageFocus(focused);}
}
async function useSoundsPageDefault(){
 if(soundsPageState.target==='default'||liveGameSoundSaving||liveCustomSoundBusy)return;
 const focused=document.activeElement,target=soundsPageState.target;
 const styles={...liveGameSoundOptions().styles};delete styles[soundsPageState.target];
 try{await saveLiveGameSound('styles',styles);}
 finally{restoreSoundsPageFocus(focused,target===soundsPageState.target?document.querySelector('[data-sounds-effective-preview]'):null);}
}
function restoreSoundsPageFocus(focused,fallback=null){
 const active=document.activeElement;
 if(active&&active!==document.body&&active.isConnected)return;
 const control=focused?.isConnected&&!focused.disabled?focused:fallback;
 if(control?.isConnected&&!control.disabled)control.focus({preventScroll:true});
}
async function previewSoundsPageRecording(preset){
 if(soundsPageState.previewing||liveGameSoundSaving||liveCustomSoundBusy||!soundsPageRecording(preset))return;
 const cue=soundsPageState.target==='default'?'loaded':soundsPageState.target,focused=document.activeElement;
 soundsPageState.previewing=preset;soundsPageState.previewError='';refreshSoundsPage();
 try{await api('sounds/preview',{cue,preset,volume:liveGameSoundOptions().volume,builtIn:true});}
 catch(error){soundsPageState.previewError=error.message;}
 finally{soundsPageState.previewing='';refreshSoundsPage();restoreSoundsPageFocus(focused);}
}
function soundsPageMarkup(){
 const targets=[['default','Default sound'],...notificationSoundEvents];
 return `<section class="sounds-page" aria-label="Sounds">
  <div class="sounds-volume"><label for="sounds-volume">Volume</label><input id="sounds-volume" type="range" min="0" max="100" step="5" data-live-preference="volume" aria-label="Notification volume"><output for="sounds-volume" data-live-volume-value></output><span>Applies to all alerts</span></div>
  <div class="sounds-workspace"><section class="sounds-targets" aria-label="Alert sounds"><h2>Alert sounds</h2><p class="muted">Choose an alert to edit its sound.</p><div class="sounds-target-list">${targets.map(([cue,label])=>`<div class="sounds-target-row"><button type="button" class="sounds-target" data-sounds-target="${cue}" aria-pressed="false"><strong>${label}</strong><small data-sounds-target-description="${cue}" data-i18n-skip></small></button>${cue==='default'?'':`<input type="checkbox" data-live-preference="${cue==='marked'?'sound':cue}" aria-label="${label}" title="${label}">`}</div>`).join('')}</div><p class="sounds-target-hint">Checkboxes enable each alert.</p></section>
  <section class="sounds-editor" aria-labelledby="sounds-editor-title"><div class="sounds-editor-head"><h2 id="sounds-editor-title" data-i18n-skip></h2><button type="button" class="button ghost" data-sounds-use-default>Use default sound</button></div>
  <div class="sounds-assigned"><span>Assigned sound</span><strong data-sounds-assigned data-i18n-skip></strong><p data-sounds-assigned-hint data-i18n-skip></p><button type="button" class="button ghost" data-sound-preview="loaded" data-sound-context="sounds" data-sounds-effective-preview>${soundPlayIcon}<span>Preview assigned sound</span></button></div>
  <div class="sounds-filters"><fieldset class="sounds-language"><legend>Audio language</legend><div role="group" aria-label="Audio language"><button type="button" data-sounds-language="en" aria-pressed="false" data-i18n-skip>EN</button><button type="button" data-sounds-language="ru" aria-pressed="false" data-i18n-skip>RU</button></div></fieldset><label class="sounds-category"><span>Category</span><select data-sounds-category aria-label="Category"></select></label><label class="sounds-search"><span>Search recordings</span><input type="search" data-sounds-search placeholder="Search recordings" aria-label="Search recordings"></label></div>
  <div class="sounds-results-head"><span data-sounds-count data-i18n-skip></span><button type="button" class="sounds-clear" data-sounds-clear>Clear filters</button></div>
  <div class="sounds-recordings" role="group" aria-label="Recordings" tabindex="0"></div><div class="sounds-empty" hidden><strong>No recordings match these filters.</strong><p>Try another language, category or search.</p><button type="button" class="button ghost" data-sounds-clear>Clear filters</button></div>
  <p class="sounds-save-hint">Choose a recording to save it automatically. Preview does not change your selection.</p>
  <section class="sounds-custom" aria-label="Custom WAV clip"><h3>Custom WAV clip</h3><p>Custom WAV clips take priority. Remove a clip to use the selected game sound.</p><p class="sounds-custom-limit">WAV · up to 5 seconds / 2 MB · stored only on this PC</p>${notificationSoundEvents.map(([cue,label])=>`<div class="custom-sound-row sounds-custom-row" data-sounds-custom="${cue}" hidden><p data-sounds-clip-name data-i18n-skip></p><div class="sounds-custom-actions"><button type="button" class="button ghost" data-sound-import="${cue}" data-sound-context="sounds"><span data-sounds-import-label>Choose clip</span></button><button type="button" class="button ghost" data-sound-remove="${cue}" data-sound-context="sounds">Remove clip</button></div><input type="file" accept=".wav,audio/wav,audio/x-wav" data-sound-file="${cue}" data-sound-context="sounds" aria-label="WAV clip: ${label}" hidden></div>`).join('')}</section>
  </section></div><div class="sounds-status-row"><p class="sounds-status" role="status" aria-live="polite" data-i18n-skip></p><button type="button" class="button ghost" data-sounds-retry hidden>Retry sound clips</button></div></section>`;
}
function refreshSoundsPage(){
 const page=document.querySelector('.sounds-page');if(page)updateSoundsPage(page.parentElement);
}
function bindSoundsPage(page){
 page.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.soundsTarget){soundsPageState.target=button.dataset.soundsTarget;updateSoundsPage(page.parentElement);}
  else if(button.dataset.soundsLanguage){setSoundsPageFilter('language',button.dataset.soundsLanguage);updateSoundsPage(page.parentElement);}
  else if(button.hasAttribute('data-sounds-clear')){soundsPageState.search='';setSoundsPageFilter('category','');page.querySelector('[data-sounds-search]').value='';updateSoundsPage(page.parentElement);}
  else if(button.hasAttribute('data-sounds-use-default'))void useSoundsPageDefault();
  else if(button.dataset.soundsAssign)void assignSoundsPageRecording(button.dataset.soundsAssign);
  else if(button.dataset.soundsRecordingPreview)void previewSoundsPageRecording(button.dataset.soundsRecordingPreview);
 });
 page.addEventListener('change',event=>{if(event.target.hasAttribute('data-sounds-category')){setSoundsPageFilter('category',event.target.value);updateSoundsPage(page.parentElement);}});
 page.addEventListener('input',event=>{if(event.target.hasAttribute('data-sounds-search')){setSoundsPageFilter('search',event.target.value);updateSoundsPage(page.parentElement);}});
}
function updateSoundsPage(content){
 initializeSoundsPage();
 let page=content.querySelector('.sounds-page');
 if(!page){content.innerHTML=soundsPageMarkup();page=content.querySelector('.sounds-page');bindSoundsPage(page);void requestCustomNotificationSounds();}
 const options=liveGameSoundOptions(),target=soundsPageState.target,language=soundsPageInterface(),busy=liveGameSoundSaving||!!liveCustomSoundBusy;
 const text=(selector,value)=>{const node=page.querySelector(selector);if(node.textContent!==value)node.textContent=value;return node;};
 const selected=soundsPageRecording(soundsPageAssigned(options)),clip=target==='default'?null:liveCustomSounds[target];
 const targetLabel=target==='default'?'Default sound':notificationSoundEvents.find(([cue])=>cue===target)?.[1]||'Default sound';
 text('#sounds-editor-title',soundsPageText(targetLabel));
 for(const button of page.querySelectorAll('[data-sounds-target]')){
  const cue=button.dataset.soundsTarget,recording=soundsPageRecording(soundsPageAssigned(options,cue)),custom=cue==='default'?null:liveCustomSounds[cue];
  button.setAttribute('aria-pressed',String(cue===target));
  text(`[data-sounds-target-description="${cue}"]`,custom?custom.name:(cue!=='default'&&!options.styles?.[cue]?soundsPageText('Default sound')+' · ':'')+soundsPageName(recording));
 }
 for(const input of page.querySelectorAll('[data-live-preference]')){
  input.disabled=busy;
  if(input.type==='checkbox')input.checked=!!options[input.dataset.livePreference];
  else if(!input.dataset.soundsInitialized||document.activeElement!==input&&!(typeof notificationSoundPointerActive!=='undefined'&&notificationSoundPointerActive)){input.value=options.volume;input.dataset.soundsInitialized='true';}
 }
 text('[data-live-volume-value]',page.querySelector('[data-live-preference="volume"]').value+'%');
 text('[data-sounds-assigned]',clip?clip.name:soundsPageName(selected));
 const shown=soundsPageRecordings(),outside=selected&&!shown.some(sound=>sound.preset===selected.preset);
 text('[data-sounds-assigned-hint]',clip?soundsPageText('Custom clip active. Game recording:')+' '+soundsPageName(selected):outside?soundsPageText('The assigned recording is outside the current filters.'):target!=='default'&&!options.styles?.[target]?soundsPageText('Uses the default sound.'):soundsPageText('Built-in game recording'));
 const inherited=target!=='default'&&!options.styles?.[target];
 const useDefault=page.querySelector('[data-sounds-use-default]');useDefault.hidden=target==='default';useDefault.disabled=busy||inherited;useDefault.setAttribute('aria-pressed',String(inherited));
 const preview=page.querySelector('[data-sounds-effective-preview]');preview.dataset.soundPreview=target==='default'?'loaded':target;preview.dataset.soundGlobal=String(target==='default');
 // The default previews its recording; alert previews retain custom-clip priority.
 if(target==='default')preview.dataset.soundBuiltIn='true';else delete preview.dataset.soundBuiltIn;
 // The incumbent preview handler owns its pending flag. Polls must not re-enable it.
 if(busy){preview.disabled=true;preview.dataset.soundsBusyDisabled='true';}
 else if(preview.dataset.soundsBusyDisabled){preview.disabled=false;delete preview.dataset.soundsBusyDisabled;}
 for(const button of page.querySelectorAll('[data-sounds-language]'))button.setAttribute('aria-pressed',String(button.dataset.soundsLanguage===soundsPageState.language));
 const categorySelect=page.querySelector('[data-sounds-category]'),categories=soundsPageCategories();
 const categorySignature=JSON.stringify([language,soundsPageState.language,categories.map(category=>category.key)]);
 if(categorySelect.dataset.signature!==categorySignature){
  categorySelect.innerHTML=`<option value="">${esc(soundsPageText('All categories'))}</option>`+categories.map(category=>`<option value="${esc(category.key)}" data-i18n-skip>${esc(soundsPageCategoryName(category))}</option>`).join('');categorySelect.dataset.signature=categorySignature;
 }
 if(categorySelect.value!==soundsPageState.category)categorySelect.value=soundsPageState.category;
 const search=page.querySelector('[data-sounds-search]');if(search.value!==soundsPageState.search)search.value=soundsPageState.search;
 const list=page.querySelector('.sounds-recordings'),listSignature=JSON.stringify([language,shown.map(sound=>sound.preset)]);
 if(list.dataset.signature!==listSignature){
  const scroll=list.scrollTop;
  list.innerHTML=shown.map(sound=>`<div class="sounds-recording" data-sounds-row="${esc(sound.preset)}"><button type="button" class="sounds-recording-choice" data-sounds-assign="${esc(sound.preset)}" aria-pressed="false" data-i18n-skip><strong>${esc(soundsPageName(sound))}</strong><small>${esc(soundsPageCategoryName(starcraftSoundLibrary.categories.find(category=>category.key===sound.category)))}</small></button><button type="button" class="sounds-recording-preview" data-sounds-recording-preview="${esc(sound.preset)}" aria-label="${esc(soundsPageText('Preview recording')+': '+soundsPageName(sound))}" data-i18n-skip>${soundPlayIcon}</button></div>`).join('');
  list.dataset.signature=listSignature;list.scrollTop=scroll;
 }
 for(const row of list.querySelectorAll('[data-sounds-row]')){
  const assigned=row.dataset.soundsRow===selected?.preset,choice=row.querySelector('[data-sounds-assign]'),button=row.querySelector('[data-sounds-recording-preview]');
  choice.setAttribute('aria-pressed',String(assigned));choice.disabled=busy;row.classList.toggle('is-assigned',assigned);button.disabled=busy||!!soundsPageState.previewing;
 }
 text('[data-sounds-count]',String(shown.length)+' '+soundsPageText('recordings'));
 list.hidden=!shown.length;page.querySelector('.sounds-empty').hidden=!!shown.length;
 page.querySelector('.sounds-custom').hidden=target==='default';
 for(const row of page.querySelectorAll('[data-sounds-custom]')){
  const cue=row.dataset.soundsCustom,custom=liveCustomSounds[cue];row.hidden=cue!==target;
  const name=row.querySelector('[data-sounds-clip-name]'),value=custom?`${custom.name} · ${custom.seconds.toFixed(1)}s`:soundsPageText('No custom clip');if(name.textContent!==value)name.textContent=value;
  row.querySelector('[data-sound-remove]').hidden=!custom;
  const label=row.querySelector('[data-sounds-import-label]'),valueLabel=soundsPageText(custom?'Replace clip':'Choose clip');if(label.textContent!==valueLabel)label.textContent=valueLabel;
  for(const control of row.querySelectorAll('button,input'))control.disabled=busy||!liveCustomSoundLoaded;
 }
 const error=liveGameSoundError||liveCustomSoundError||soundsPageState.previewError;
 const status=error||(liveGameSoundSaving?'Saving…':liveCustomSoundBusy?'Saving sound clip…':!liveCustomSoundLoaded?'Loading sound clips…':'Saved automatically · runs while the tray app is open');
 text('.sounds-status',soundsPageText(status)).classList.toggle('live-controls-error',!!error);
 page.querySelector('[data-sounds-retry]').hidden=!liveCustomSoundError;page.querySelector('[data-sounds-retry]').disabled=busy;
}
