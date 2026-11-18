/// <reference lib="webworker" />
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { validatePropertyRows } from "@/lib/import-utils";
const worker = self as DedicatedWorkerGlobalScope;
let workbookSheets:{name:string;rows:unknown[][]}[]=[];
worker.onmessage = async (event: MessageEvent<{type?:string;file?:ArrayBuffer;name?:string;encoding?:string;sheetIndex?:number;mapping?:Record<string,number>;trim?:boolean;cleanPhones?:boolean;date?:string}>) => {
 try {
  const message=event.data;
  if(message.type==="validate"){
   const sheet=workbookSheets[message.sheetIndex??0];if(!sheet)throw new Error("ورقة العمل المحددة غير موجودة");
   const mapped=await validatePropertyRows(sheet.rows,message.mapping??{},{trim:message.trim??true,cleanPhones:message.cleanPhones??true,date:message.date??new Date().toISOString().slice(0,10)},(done,total)=>worker.postMessage({type:"progress",done,total}));
   worker.postMessage({type:"validated",rows:mapped});return;
  }
  const {file,name="file.csv",encoding="auto"}=message;if(!file)throw new Error("لم يتم استلام محتوى الملف");
  if(name.toLowerCase().endsWith(".csv")){
   let text="";
   if(encoding==="auto"){
    try{text=new TextDecoder("utf-8",{fatal:true}).decode(file)}catch{text=new TextDecoder("windows-1256").decode(file)}
   }else text=new TextDecoder(encoding).decode(file);
   const parsed=Papa.parse<string[]>(text,{skipEmptyLines:"greedy"});
   workbookSheets=[{name:"CSV",rows:parsed.data as unknown[][]}];
   worker.postMessage({type:"parsed",sheets:workbookSheets.map(sheet=>({name:sheet.name,rowCount:sheet.rows.length,headers:sheet.rows[0]??[],preview:sheet.rows.slice(0,21)}))});return;
  }
  const book=XLSX.read(file,{type:"array",cellDates:true});
  workbookSheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name],{header:1,defval:"",raw:false,blankrows:false})}));
  worker.postMessage({type:"parsed",sheets:workbookSheets.map(sheet=>({name:sheet.name,rowCount:sheet.rows.length,headers:sheet.rows[0]??[],preview:sheet.rows.slice(0,21)}))});
 }catch(error){worker.postMessage({type:"error",message:error instanceof Error?error.message:"تعذر قراءة الملف"})}
};
export {};
