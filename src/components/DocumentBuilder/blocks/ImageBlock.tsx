import{Image as ImageIcon}from'lucide-react';
import{useDocumentStore}from'../useDocumentStore';
import type{ImageBlock}from'../types';
import{useAuthImage,isInternalSrc}from'../useAuthImage';
interface Props{block:ImageBlock;columnsBlockId?:string;columnId?:string;}
const SZ:Record<string,string>={small:'max-w-[200px]',medium:'max-w-[400px]',large:'max-w-[600px]',full:'w-full'};
const AL:Record<string,string>={left:'mr-auto',center:'mx-auto',right:'ml-auto'};
export default function ImageBlockView({block,columnsBlockId,columnId}:Props){
 const{mode,updateBlock,updateBlockInColumn}=useDocumentStore();
 const upd=(p:Partial<ImageBlock>)=>columnsBlockId&&columnId?updateBlockInColumn(columnsBlockId,columnId,block.id,p):updateBlock(block.id,p);
 const sz=SZ[block.size]??SZ.medium;const al=AL[block.align]??AL.center;
 const na=!!block.src&&isInternalSrc(block.src);
 const{blobUrl,loading,failed}=useAuthImage(na?block.src:undefined);
 const ds=na?blobUrl:(block.src||null);
 if(!block.src){if(mode!=='edit')return null;
  return(<div className={'my-2 '+sz+' '+al+' border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center gap-2'}>
   <ImageIcon size={28}/><p className='text-xs font-medium text-slate-500'>Image block</p>
   <p className='text-[10px] text-slate-400'>Select this block then use the inspector to add an image.</p></div>);}
 if(na&&loading)return(<div className={'my-2 '+sz+' '+al+' flex items-center justify-center h-20 rounded-lg bg-slate-50 border border-slate-200'}><div className='w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full animate-spin'/></div>);
 if(na&&failed)return(<div className={'my-2 '+sz+' '+al+' flex flex-col items-center justify-center h-20 rounded-lg bg-red-50 border border-red-200 gap-1'}><ImageIcon size={18} className='text-red-400'/><p className='text-[10px] text-red-500'>Image could not be loaded</p></div>);
 if(!ds)return null;
 return(<div className={'my-2 '+sz+' '+al}>
  <img src={ds} alt={block.alt} className={'rounded '+(block.preserveAspectRatio?'object-contain':'object-cover')+' w-full'}/>
  {block.caption&&<p className='text-xs text-slate-500 text-center mt-1 italic'>{block.caption}</p>}
 </div>);}
