'use strict';

// Tags are presentation metadata. Nicknames, native IDs and site lookup keys stay unchanged.
function playerNameParts(value){
 let text=String(value??'').trim();
 if(text.includes('&')&&typeof document!=='undefined'&&typeof document.createElement==='function'){
  const decoder=document.createElement('textarea');decoder.innerHTML=text;text=decoder.value;
 }
 const tagged=/^(?:<([^<>]+)>|\[([^\[\]]+)\])\s*(.+)$/.exec(text);
 return {name:tagged?tagged[3].trim():text,clanTag:tagged?(tagged[1]||tagged[2]).trim():null,display:text};
}
function formatPlayerName(name,clanTag){
 const parts=playerNameParts(name);
 if(parts.clanTag!==null)return parts.display;
 const tag=typeof clanTag==='string'?clanTag.trim().replace(/^[<\[]|[>\]]$/g,''):'';
 return tag&&!/[<>\[\]\u0000-\u001f]/.test(tag)&&tag.length<=64?`<${tag}> ${parts.name}`:parts.name;
}
function displayPlayerName(id,name){
 const local=typeof findPlayer==='function'?findPlayer(id):null;
 const account=typeof ownProfileFor==='function'?ownProfileFor(id):null;
 const base=name||local?.name||account?.name||id||'';
 const tag=typeof local?.clanTag==='string'?local.clanTag:typeof account?.clanTag==='string'?account.clanTag:null;
 if(tag!==null)return formatPlayerName(base,tag);
 const profile=typeof siteProfileFor==='function'?siteProfileFor(id):null;
 return formatPlayerName(base,playerNameParts(profile?.name).clanTag);
}
function replayPlayerName(player){return formatPlayerName(player.name,player.clanTag);}
