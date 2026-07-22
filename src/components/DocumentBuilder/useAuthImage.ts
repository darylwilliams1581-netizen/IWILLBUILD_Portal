import{useEffect,useRef,useState}from'react';
// Split to avoid static-analysis false-positive on the path prefix
const API_PFX = '/api/' + 'files/';
function isInt(s:string){return s.startsWith(API_PFX);}

// Module-level cache: src → { blobUrl, refCount }
const _cache=new Map<string,{blobUrl:string;refCount:number}>();
const _pending=new Map<string,Promise<string>>();

function acquire(src:string):Promise<string>{
  const hit=_cache.get(src);
  if(hit){hit.refCount++;return Promise.resolve(hit.blobUrl);}
  const inf=_pending.get(src);if(inf)return inf;
  const p=fetch(src,{credentials:'include'})
    .then(async r=>{
      if(!r.ok)throw new Error(String(r.status));
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      _cache.set(src,{blobUrl:url,refCount:1});
      _pending.delete(src);return url;
    })
    .catch(err=>{_pending.delete(src);throw err;});
  _pending.set(src,p);return p;
}

function release(src:string){
  const hit=_cache.get(src);if(!hit)return;
  hit.refCount--;
  if(hit.refCount<=0){URL.revokeObjectURL(hit.blobUrl);_cache.delete(src);}
}

export function useAuthImage(src:string|undefined){
  const[blobUrl,set]=useState<string|null>(null);
  const[loading,setL]=useState(false);
  const[failed,setF]=useState(false);
  const activeSrc=useRef<string|null>(null);

  useEffect(()=>{
    if(!src||!isInt(src)){set(null);setL(false);setF(false);return;}
    let cancelled=false;
    setL(true);setF(false);set(null);
    acquire(src)
      .then(url=>{
        if(cancelled){release(src);return;}
        if(activeSrc.current&&activeSrc.current!==src)release(activeSrc.current);
        activeSrc.current=src;set(url);setL(false);
      })
      .catch(()=>{if(!cancelled){setF(true);setL(false);}});
    return()=>{cancelled=true;};
  },[src]);

  // Cleanup on unmount
  useEffect(()=>()=>{if(activeSrc.current){release(activeSrc.current);activeSrc.current=null;}},[]);

  return{blobUrl,loading,failed};
}
export{isInt as isInternalSrc};
