/// <reference lib="webworker" />
import * as XLSX from "xlsx";
import Papa from "papaparse";
const worker = self as DedicatedWorkerGlobalScope;
worker.onmessage = async (event: MessageEvent<{file:ArrayBuffer;name:string;encoding?:string}>) => {
 try {
  const {file,name,encoding="auto"}=event.data;
  if(name.toLowerCase().endsWith(".csv")){
   let text="";
   if(encoding==="auto"){
    try{text=new TextDecoder("utf-8",{fatal:true}).decode(file)}catch{text=new TextDecoder("windows-1256").decode(file)}
   }else text=new TextDecoder(encoding).decode(file);
   const parsed=Papa.parse<string[]>(text,{skipEmptyLines:"greedy"});
   worker.postMessage({type:"parsed",sheets:[{name:"CSV",rows:parsed.data}]});return;
  }
  const book=XLSX.read(file,{type:"array",cellDates:true});
  const sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,defval:"",raw:false,blankrows:false})}));
  worker.postMessage({type:"parsed",sheets});
 }catch(error){worker.postMessage({type:"error",message:error instanceof Error?error.message:"تعذر قراءة الملف"})}
};
export {};
