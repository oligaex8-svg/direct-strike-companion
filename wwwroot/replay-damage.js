'use strict';
let replayDamageState={},replayDamageTimer;
function replayDamageText(en,ru){return typeof interfaceLocale==='function'&&interfaceLocale().startsWith('ru')?ru:en;}
function replayDamagePanel(match){return `<div class="replay-damage-panel" data-damage-hash="${esc(match.hash)}">${replayDamageControls(match)}</div>`;}
function replayDamageControls(match){
 const current=replayDamageState.hash===match.hash?replayDamageState:{},busy=current.busy,measuredCount=match.damage?.players?.length||0,measured=measuredCount===6;
 const message=current.phase==='partial'&&measured?replayDamageText('Measurement stopped early. Previously verified damage totals remain included.','Измерение завершилось досрочно. Ранее проверенные значения урона по-прежнему учитываются.'):current.phase==='partial'?replayDamageText('Damage is counted for the fully measured team. SC2 could not finish the other team; its damage remains unavailable.','Урон учтён для полностью измеренной команды. SC2 не завершила измерение другой команды; её урон пока недоступен.'):current.message|| (measuredCount?replayDamageText(`${measuredCount}/6 players measured. HP + shield damage counts toward player Impact for complete teams.`,`${measuredCount}/6 игроков измерено. Урон здоровью и щитам учитывается во вкладе полностью измеренных команд.`):replayDamageText('Measure actual damage dealt and received for all six players.','Измерить нанесённый и полученный урон всех шести игроков.'));
 return `<div class="replay-damage-actions"><strong>${replayDamageText('Damage measurement','Измерение урона')}</strong><button type="button" class="replay-damage-button" data-damage-action="${busy?'cancel':'start'}" data-damage-match="${esc(match.hash)}"${!busy&&replayDamageState.busy?' disabled':''}>${busy?replayDamageText('Cancel analysis','Отменить анализ'):measured?replayDamageText('Measure again','Измерить снова'):measuredCount?replayDamageText('Continue measurement','Продолжить измерение'):replayDamageText('Measure damage · SC2','Измерить урон · SC2')}</button></div>${busy?`<progress value="${Number(current.completed)||0}" max="6" aria-label="${replayDamageText('Players measured','Измерено игроков')}"></progress>`:''}<p class="meta" role="${current.phase==='error'?'alert':'status'}" data-i18n-skip>${esc(message)}</p><details><summary>${replayDamageText('How measurement works','Как работает измерение')}</summary><p class="meta">${replayDamageText('SC2 replays this match once for each player in a small window. Start while SC2 is closed; analysis can take several minutes. Verified passes are kept for retry. Damage counts only after all three players on a team have complete final measurements. If the other team cannot be measured, its damage stays unavailable. Unit and ability damage breakdowns remain unavailable.','SC2 воспроизводит матч отдельно для каждого игрока в небольшом окне. Запускайте при закрытой SC2; анализ может занять несколько минут. Проверенные проходы сохраняются для повторной попытки. Урон учитывается только после полного измерения всех трёх игроков команды. Если другую команду измерить не удалось, её урон остаётся недоступным. Урон отдельных юнитов и способностей пока недоступен.')}</p></details>`;
}
function updateReplayDamagePanels(){
 document.querySelectorAll('[data-damage-hash]').forEach(panel=>{
  const match=state?.library?.matches?.find(m=>m.hash===panel.dataset.damageHash);if(!match)return;
  const open=!!panel.querySelector('details')?.open,focused=panel.contains(document.activeElement)?document.activeElement.dataset.damageAction:null;
  panel.innerHTML=replayDamageControls(match);if(open)panel.querySelector('details').open=true;
  if(focused)panel.querySelector(`[data-damage-action="${focused}"]`)?.focus({preventScroll:true});
 });
}
async function pollReplayDamage(){
 clearTimeout(replayDamageTimer);
 try{const previous=replayDamageState;replayDamageState=await api('replay-damage/status');updateReplayDamagePanels();
  if(previous.busy&&!replayDamageState.busy&&['complete','partial'].includes(replayDamageState.phase))await refresh();
 }catch(error){if(!replayDamageState.busy)return;}
 if(replayDamageState.busy)replayDamageTimer=setTimeout(pollReplayDamage,1500);
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-damage-action]');if(!button||button.disabled)return;
 button.disabled=true;
 try{
  replayDamageState=await api(button.dataset.damageAction==='cancel'?'replay-damage/cancel':`replay-damage/${encodeURIComponent(button.dataset.damageMatch)}/start`,{});
  updateReplayDamagePanels();void pollReplayDamage();
 }catch(error){toast(error.message);button.disabled=false;}
});
document.addEventListener('DOMContentLoaded',()=>void pollReplayDamage());
