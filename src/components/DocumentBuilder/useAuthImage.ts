import{useEffect,useRef,useState}from'react';
function isInt(s:string){return s.startsWith('/api/files/')}
const mk=(b:Blob)=>(URL as typeof URL).createObjectURL(b);
const rm=(u:string)=>(URL as typeof URL).revokeObjectURL(u);
export function useAuthImage(src:string|undefined){
 const[blobUrl,set]=useState<string|null>(null);
 const[loading,setL]=useState(false);
 const[failed,setF]=useState(false);
 const prev=useRef<string|null>(null);
 useEffect(()=>{
  if(!src||!isInt(src)){set(null);setL(false);setF(false);return;}
  let c=false;setL(true);setF(false);set(null);
  fetch(src,{credentials:'include'}).then(async r=>{
   if(!r.ok)throw new Error(String(r.status));
   const b=await r.blob();if(c)return;
   if(prev.current){const o=prev.current;setTimeout(()=>rm(o),0);}
   const n=mk(b);prev.current=n;set(n);setL(false);
  }).catch(()=>{if(!c){setF(true);setL(false);}});
  return()=>{c=true;};
 },[src]);
 useEffect(()=>()=>{if(prev.current)rm(prev.current);},[]);
 return{blobUrl,loading,failed};
}
export{isInt as isInternalSrc};
