'use strict';
// Replay authored Default geometry after skin paint. Read source text rather
// than CSSOM: Chromium serializes pending var() border shorthands as empty
// longhands, which would silently lose the Default frame's reserved space.
const fs=require('node:fs'),path=require('node:path');
const allowed=new Set(('box-sizing display position inset top right bottom left width min-width max-width height min-height max-height padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow grid-auto-columns grid-auto-rows grid-column grid-row grid-area flex flex-direction flex-wrap flex-basis flex-grow flex-shrink align-items align-content align-self justify-content justify-items justify-self order font font-family font-size font-weight font-style line-height letter-spacing text-transform text-align vertical-align white-space overflow-wrap word-break overflow overflow-x overflow-y container container-type container-name border-width border-top-width border-right-width border-bottom-width border-left-width border-style border-top-style border-right-style border-bottom-style border-left-style').split(' '));
for(const property of 'float clear font-variant font-variant-numeric font-variant-ligatures font-feature-settings font-kerning font-stretch text-indent word-spacing table-layout border-collapse border-spacing'.split(' '))allowed.add(property);
for(const family of ['margin','padding','inset'])for(const axis of ['inline','block'])for(const edge of ['', '-start','-end'])allowed.add(family+'-'+axis+edge);
for(const property of 'inline-size min-inline-size max-inline-size block-size min-block-size max-block-size'.split(' '))allowed.add(property);
function split(text,delimiter){let depth=0,quote='',start=0;const parts=[];for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if('(['.includes(c))depth++;if(')]'.includes(c))depth--;if(c===delimiter&&!depth){parts.push(text.slice(start,i).trim());start=i+1;}}parts.push(text.slice(start).trim());return parts.filter(Boolean);}
function geometry(text){const values=new Map();for(const declaration of split(text,';')){const colon=declaration.indexOf(':');if(colon<0)continue;const property=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim().replace(/\s*!important$/,'');if(allowed.has(property)||/^--(?:type-|shell-(?:safe-space|head-size|frame-size))$/.test(property))values.set(property,value);if(/^border(?:-(?:top|right|bottom|left))?$/.test(property)){const width=value.match(/^(0(?:px)?|[\d.]+(?:px|rem|em)|var\(--shell-frame-size\))/)?.[1];if(width){values.set(property+'-width',width);values.set(property+'-style',/\bnone\b/.test(value)||width==='0'?'none':'solid');}}}return values;}
function commonSelector(original){if(/::|:before\b|:after\b|data-native-console/.test(original))return null;let value=original;if(/data-graphical-style/.test(value)){if(/:not\([^)]*data-graphical-style/.test(value)||!/\[data-graphical-style=['"]?default['"]?\]/.test(value))return null;value=value.replace(/\[data-graphical-style=['"]?default['"]?\]/g,'[data-native-console]');}const scope=':where(:root[data-native-console])';return /^(?:html|:root)(?=[\s.:[#]|$)/.test(value)?value.replace(/^(html|:root)/,'$1:where([data-native-console])'):scope+' '+value;}
function build({webRoot,outputFile,indexFile=path.join(webRoot,'index.html')}){
 const resets=new Map();let count=0;
 function walk(text){text=text.replace(/\/\*[\s\S]*?\*\//g,'');let output='',start=0,quote='',depth=0,open=-1;
  for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c===';'&&!depth){start=i+1;continue;}if(c==='{'){if(depth++===0)open=i;continue;}if(c!=='}'||--depth!==0)continue;
   const head=text.slice(start,open).trim(),body=text.slice(open+1,i);start=i+1;
   if(head.startsWith('@')){if(/^@(media|supports|container)\b/.test(head)){const inner=walk(body);if(inner)output+=head+'{'+inner+'}\n';}continue;}
   const values=geometry(body),selectors=split(head,',');if(!values.size)continue;
   for(const selector of selectors){if(/::|:before\b|:after\b/.test(selector)||!/(?:data-native-console|data-graphical-style)/.test(selector)||/\[data-graphical-style=['"]?default['"]?\]/.test(selector)&&!/:not\(/.test(selector))continue;const rootOnly=/^(?:html|:root)(?:\[[^\]]+\]|:not\([^)]*\))*$/.test(selector);const key=':where(:root[data-native-console])'+(rootOnly?'':' ')+':where('+selector+')',properties=resets.get(key)||new Set();for(const key of values.keys())properties.add(key);resets.set(key,properties);}
   const common=selectors.map(commonSelector).filter(Boolean);if(common.length){output+=common.join(',')+'{'+[...values].map(([key,value])=>key+':'+value+'!important').join(';')+'}\n';count++;}
  }return output;
 }
 const index=fs.readFileSync(indexFile,'utf8');
 const styles=[...index.matchAll(/<link\b[^>]*href="\/(.*?)\.css"[^>]*>/g)].map(match=>match[1]+'.css').filter(file=>!/(?:shared-theme-layout|native-skin-frame)/.test(file));
 const css=styles.map(file=>walk(fs.readFileSync(path.join(webRoot,file),'utf8'))).join('');
 const resetCss=[...resets].map(([selector,properties])=>selector+'{'+[...properties].map(property=>property+':revert!important').join(';')+'}\n').join('');
 fs.writeFileSync(outputFile,'/* Generated by verification/Build-SharedThemeLayout.cjs from Default source rules.\n   Geometry is shared across skins; native art remains independent. Do not edit. */\n'+resetCss+css);
 return {rules:count,resets:resets.size,bytes:fs.statSync(outputFile).size};
}
module.exports={build,split,geometry,commonSelector};
if(require.main===module){const sourceRoot=process.env.DSC_SOURCE_ROOT||path.resolve(__dirname,'..');console.log(JSON.stringify(build({webRoot:path.join(sourceRoot,'wwwroot'),outputFile:process.env.DSC_LAYOUT_OUTPUT||path.join(sourceRoot,'wwwroot/shared-theme-layout.css')})));}
