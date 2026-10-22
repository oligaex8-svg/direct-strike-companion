'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const checks=[];
const observers=[],frames=[];
class MutationObserver {
 constructor(callback){this.callback=callback;observers.push(this);}
 observe(dialog,options){this.dialog=dialog;assert.equal(options.attributes,true);assert.deepEqual(Array.from(options.attributeFilter),['open']);assert.equal(options.attributeOldValue,true);}
}
function openMutation(dialog,oldValue){observers.find(observer=>observer.dialog===dialog).callback([{oldValue}]);}
function renderFrame(){while(frames.length)frames.shift()();}
class Dialog {
 constructor(id){this.id=id;this.open=true;this.closed=0;this.listeners={};this.body={scrollTop:0};this.bounds={left:100,top:100,right:500,bottom:500};}
 addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
 querySelector(selector){assert.equal(selector,'.dialog-body');return this.body;}
 getBoundingClientRect(){return this.bounds;}
 emit(type,values={}){const event={target:this,button:0,isPrimary:true,detail:1,clientX:50,clientY:50,...values};for(const handler of this.listeners[type]||[])handler(event);}
 close(){this.open=false;this.closed++;this.emit('close');}
}
const dialogs=['player','combat','match','rating','settings'].map(id=>new Dialog(id+'-dialog'));
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../wwwroot/dialogs.js'),'utf8'),{MutationObserver,requestAnimationFrame:callback=>frames.push(callback),document:{querySelectorAll:selector=>{assert.equal(selector,'dialog');return dialogs;}}});
function check(name,body){renderFrame();for(const dialog of dialogs){dialog.emit('close');dialog.open=true;dialog.closed=0;dialog.body={scrollTop:0};}body();checks.push(name);}
function gesture(dialog,start={},end=start){dialog.emit('pointerdown',start);dialog.emit('click',end);}
check('All five dialogs dismiss on a left primary backdrop click',()=>{
 for(const dialog of dialogs){gesture(dialog);assert.equal(dialog.closed,1);}
});
check('A clicked dialog closes independently of other open dialogs',()=>{
 gesture(dialogs[3]);assert.deepEqual(dialogs.map(dialog=>dialog.closed),[0,0,0,1,0]);
});
check('Blank padding and each border edge stay open',()=>{
 const dialog=dialogs[0];
 for(const [clientX,clientY] of [[200,200],[100,200],[500,200],[200,100],[200,500]])gesture(dialog,{clientX,clientY});
 assert.equal(dialog.closed,0);
});
check('Content clicks and inside-to-backdrop selection do not dismiss',()=>{
 const dialog=dialogs[0],child={};
 gesture(dialog,{target:child,clientX:200,clientY:200},{clientX:50,clientY:50});
 gesture(dialog,{clientX:200,clientY:200},{clientX:50,clientY:50});
 gesture(dialog,{target:child},{target:child});assert.equal(dialog.closed,0);
});
check('Backdrop-to-content drag does not dismiss',()=>{
 const dialog=dialogs[0];gesture(dialog,{}, {target:{},clientX:200,clientY:200});assert.equal(dialog.closed,0);
});
check('Right, middle and non-primary pointer interactions stay open',()=>{
 const dialog=dialogs[0];for(const button of [1,2])gesture(dialog,{button});
 gesture(dialog,{isPrimary:false});assert.equal(dialog.closed,0);
});
check('Keyboard or programmatic clicks cannot dismiss via stale coordinates',()=>{
 const dialog=dialogs[0];dialog.emit('click');
 gesture(dialog,{}, {detail:0});dialog.emit('click');assert.equal(dialog.closed,0);
});
check('Cancelled gestures and close/reopen clear pending backdrop presses',()=>{
 const dialog=dialogs[0];dialog.emit('pointerdown');dialog.emit('pointercancel');dialog.emit('click');assert.equal(dialog.closed,0);
 dialog.emit('pointerdown');dialog.close();dialog.open=true;dialog.emit('click');assert.equal(dialog.closed,1);
});
check('Replacing body children leaves the dialog listeners effective',()=>{
 const dialog=dialogs[0];gesture(dialog,{target:{},clientX:200,clientY:200});
 gesture(dialog,{target:{},clientX:200,clientY:200});gesture(dialog);assert.equal(dialog.closed,1);
});
check('Geometry is measured at click time after a resize or relayout',()=>{
 const dialog=dialogs[0];dialog.emit('pointerdown');const old=dialog.bounds;
 dialog.bounds={left:0,top:0,right:500,bottom:500};dialog.emit('click');dialog.bounds=old;assert.equal(dialog.closed,0);
});
check('Reopening all five dialogs returns each body to the top after rendering',()=>{
 for(const dialog of dialogs){dialog.body.scrollTop=1826;dialog.close();openMutation(dialog,'');dialog.open=true;openMutation(dialog,null);assert.equal(dialog.body.scrollTop,1826);}
 renderFrame();for(const dialog of dialogs)assert.equal(dialog.body.scrollTop,0);
});
check('Refreshing body sections while open preserves scroll and redundant open attributes do not reset it',()=>{
 const dialog=dialogs[0];dialog.body.scrollTop=900;dialog.body.sections=['new profile sections'];renderFrame();assert.equal(dialog.body.scrollTop,900);
 openMutation(dialog,'');renderFrame();assert.equal(dialog.body.scrollTop,900);
});
check('An open mutation clears stale gestures and a dialog closed before rendering is left alone',()=>{
 const dialog=dialogs[0];dialog.emit('pointerdown');openMutation(dialog,null);dialog.emit('click');assert.equal(dialog.closed,0);
 dialog.body.scrollTop=700;dialog.close();renderFrame();assert.equal(dialog.body.scrollTop,700);
});
const report={passed:checks.length,scope:'DOM event/geometry fixture; native browser interaction is verified separately',checks};
fs.writeFileSync(path.join(__dirname,'dialogs-ui-tests.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
