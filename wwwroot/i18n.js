'use strict';

// English templates stay canonical; only display text is translated. Model keys,
// form values, URLs, player names and private notes never pass through the catalog.
let interfaceLanguage='en', interfaceLanguageReady=false, languageSaving=false;
const interfaceTextRecords=new WeakMap(), interfaceAttributeRecords=new WeakMap(), interfaceTranslationCache=new Map();
const interfaceAttributes=['placeholder','title','aria-label','label'];
const interfaceProtected='script,style,textarea,pre,code,[data-i18n-skip],.brand,.player-name,.roster-chip,.alert-item strong,.live-slot-head h3,#detail-name,.pick-opponent h3,#rating-results .candidate strong,.live-mark-note';
let interfaceObserver;

function interfaceLocale(){return interfaceLanguage==='ru'?'ru-RU':'en-GB';}
function translateInterfaceText(source,language=interfaceLanguage,depth=0){
 if(language!=='ru'||source===null||source===undefined)return source;
 const value=String(source),normalized=value.trim().replace(/\s+/g,' ');
 if(!normalized)return value;
 let translated;
 if(Object.hasOwn(RU_UI_TEXT,normalized))translated=RU_UI_TEXT[normalized];
 else for(const rule of RU_UI_RULES){const match=rule.pattern.exec(normalized);if(match){translated=rule.translate(...match);break;}}
 // Sentence fragments from a composed tooltip may gain or lose their period.
 // Only an exact reviewed entry is eligible for punctuation normalization.
 if(translated===undefined&&normalized.endsWith('.')&&Object.hasOwn(RU_UI_TEXT,normalized.slice(0,-1)))translated=RU_UI_TEXT[normalized.slice(0,-1)].replace(/\.$/,'')+'.';
 if(translated===undefined&&!normalized.endsWith('.')&&Object.hasOwn(RU_UI_TEXT,normalized+'.'))translated=RU_UI_TEXT[normalized+'.'].replace(/\.$/,'');
 // Compose reviewed phrases without translating arbitrary words inside names.
 if(translated===undefined&&depth<3){
  for(const separator of [' · ','. ']){
   if(!normalized.includes(separator))continue;
   const parts=normalized.split(separator),converted=parts.map(part=>translateInterfaceText(part,language,depth+1));
   if(converted.some((part,index)=>part!==parts[index])){translated=converted.join(separator);break;}
  }
 }
 if(translated===undefined)return value;
 return value.slice(0,value.length-value.trimStart().length)+translated+value.slice(value.trimEnd().length);
}
function cachedInterfaceText(source){
 if(interfaceLanguage!=='ru')return source;
 if(interfaceTranslationCache.has(source))return interfaceTranslationCache.get(source);
 const result=translateInterfaceText(source);
 if(interfaceTranslationCache.size>=2048)interfaceTranslationCache.clear();
 interfaceTranslationCache.set(source,result);return result;
}
function interfaceNodeText(node,source){
 const parent=node.parentElement;
 if(parent?.matches('#pick-opponent option')&&parent.value){
  // The first segment is the untouched public name; the last is a replay ID.
  const name=parent.getAttribute?.('data-player-name');
  const tail=name&&source.startsWith(name+' · ')?source.slice(name.length+3):null;
  const parts=(tail??source).split(' · ');
  const rendered=parts.map((part,index)=>(tail===null&&index===0)||index===parts.length-1?part:cachedInterfaceText(part)).join(' · ');
  return tail===null?rendered:name+' · '+rendered;
 }
 return cachedInterfaceText(source);
}
function translateInterfaceNode(node){
 if(node.nodeType===3){
  if(!node.parentElement||node.parentElement.closest(interfaceProtected))return;
  const old=interfaceTextRecords.get(node),source=old&&old.rendered===node.nodeValue?old.source:node.nodeValue;
  const rendered=interfaceNodeText(node,source);
  interfaceTextRecords.set(node,{source,rendered});if(rendered!==node.nodeValue)node.nodeValue=rendered;
 }else if(node.nodeType===1){
  // Data containers retain their names, but a reviewed aria-label prefix can
  // still describe them in Russian without modifying the captured identity.
  if(node.closest('[data-i18n-skip],script,style,.brand'))return;
  let records=interfaceAttributeRecords.get(node);
  if(!records){records=new Map();interfaceAttributeRecords.set(node,records);}
  for(const attribute of interfaceAttributes){
   if(!node.hasAttribute(attribute))continue;
   const current=node.getAttribute(attribute),old=records.get(attribute),source=old&&old.rendered===current?old.source:current;
   const rendered=cachedInterfaceText(source);records.set(attribute,{source,rendered});if(rendered!==current)node.setAttribute(attribute,rendered);
  }
 }
}
function observeInterface(){interfaceObserver?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:interfaceAttributes});}
function translateInterface(root=document){
 interfaceObserver?.disconnect();
 try{
  translateInterfaceNode(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode())translateInterfaceNode(walker.currentNode);
 }finally{observeInterface();}
}
function setInterfaceLanguage(language){
 const next=language==='ru'?'ru':'en';
 const selector=document.getElementById('ui-language');if(selector){selector.value=next;selector.disabled=languageSaving;}
 if(interfaceLanguageReady&&next===interfaceLanguage)return;
 interfaceLanguage=next;interfaceLanguageReady=true;interfaceTranslationCache.clear();document.documentElement.lang=next;
 for(const option of document.querySelectorAll('#pick-enemy-commander option'))if(option.value)option.textContent=commanderName(option.value);
 translateInterface();
}
async function changeInterfaceLanguage(language){
 if(languageSaving)return;
 const previous=interfaceLanguage;
 languageSaving=true;document.getElementById('ui-language').disabled=true;
 try{
  const saved=await api('language',{language});
  state.library.settings.language=saved.language;setInterfaceLanguage(saved.language);
  document.getElementById('settings-language').value=saved.language;
  render();
  if(document.getElementById('player-dialog').open&&detailId)showPlayer(detailId,true);
  if(document.getElementById('combat-dialog').open&&combatSelection)showCombat(combatSelection.id,combatSelection.commander);
  if(document.getElementById('match-dialog').open&&matchSelection)showMatch(matchSelection);
  translateInterface();toast('Language changed.');
 }catch(error){setInterfaceLanguage(previous);toast(error.message);}
 finally{languageSaving=false;document.getElementById('ui-language').disabled=false;}
}

if(typeof document!=='undefined'){
 interfaceObserver=new MutationObserver(records=>{
  const roots=new Set();
  for(const record of records){
   if(record.type==='childList')for(const node of record.addedNodes)roots.add(node);
   else roots.add(record.target);
  }
  for(const root of roots)if(root.isConnected&&![...roots].some(other=>other!==root&&other.contains(root)))translateInterface(root);
 });
 observeInterface();
 document.getElementById('ui-language').addEventListener('change',event=>{void changeInterfaceLanguage(event.target.value);});
}
