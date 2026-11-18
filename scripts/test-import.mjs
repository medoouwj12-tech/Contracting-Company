import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const XLSX = require("xlsx");
const helperPath = fileURLToPath(new URL("../src/lib/import-utils.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(helperPath,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};
new Function("exports","require","module",compiled)(mod.exports,require,mod);
const {autoMap,parseNumber,splitPhones,validatePropertyRows}=mod.exports;

const headers=["رمز العقار","اسم العميل","الهاتف","نوع العقار","نوع العرض","المنطقة","القطعة","القسيمة","الشارع","نوع الموقع","المساحة","السعر","الموظف المسؤول","التفاصيل"];
const rows=[headers];
const total=50_250;
for(let i=1;i<=total;i++){
  if(i%211===0) rows.push([]); // blank rows appear in legacy workbooks
  const duplicate=i%97===0;
  const phone=duplicate?"+965 5555 0001":`٠٠٩٦٥ ٥٥٥٥ ${String(i%10000).padStart(4,"0")}`;
  const title=i%503===0?"أرض (مدمجة مع ملاحظة الجوار)":"أرض";
  rows.push([`A-${i}`,i%997===0?"":`عميل ${i}`,phone,title,"معروض للبيع",i%2?"الأندلس":"الروضة",String(i%12+1),String(i),"شارع ١٢","زاوية شارعين","٥٠٠ م²","١٨٥٬٠٠٠ د.ك","سارة العتيبي",i%503===0?"ملاحظة طويلة":"بيانات اختبار كبيرة"]);
}

const book=XLSX.utils.book_new();
const sheet=XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(book,sheet,"العقارات");
const instructions=XLSX.utils.aoa_to_sheet([["تعليمات الملف","",""],["الملاحظة","يُتجاهل الصف الفارغ",""]]);
instructions["!merges"]=[{s:{r:0,c:0},e:{r:0,c:2}}]; // merged title cell, like older office exports
XLSX.utils.book_append_sheet(book,instructions,"تعليمات");
const buffer=XLSX.write(book,{type:"buffer",bookType:"xlsx",compression:true});
assert.ok(buffer.length<50*1024*1024,"generated workbook should stay under the 50 MB limit");

const parsed=XLSX.read(buffer,{type:"buffer",cellDates:true});
assert.equal(parsed.SheetNames.length,2,"multiple sheets should remain selectable");
assert.equal(parsed.Sheets["تعليمات"]["!merges"].length,1,"merged sheet cells should survive workbook parsing");
const data=XLSX.utils.sheet_to_json(parsed.Sheets["العقارات"],{header:1,defval:"",raw:false,blankrows:false});
assert.ok(data.length>50_000,"50k+ non-empty rows should parse");
assert.equal(data[0][0],"رمز العقار");
const mapping=autoMap(data[0]);
assert.equal(data[0][mapping.client],"اسم العميل");
assert.equal(data[0][mapping.phone],"الهاتف");
assert.equal(parseNumber("١٨٥٬٠٠٠ د.ك"),185000,"Arabic digits, grouping marks and currency text should normalize");
assert.equal(parseNumber("٥٠٠ م²"),500,"Arabic area values should normalize");
assert.deepEqual(splitPhones("+965 5000 1234 / 00965 6000 5678"),["+965 50001234","+965 60005678"]);
assert.deepEqual(splitPhones("5000 1234 6000 5678"),["+965 50001234","+965 60005678"]);
const staged=await validatePropertyRows(data,mapping,{trim:true,cleanPhones:true,date:"2026-11-18"});
assert.equal(staged.length,data.length-1,"all non-header rows should be validated");
assert.ok(staged.some(row=>row.errors.includes("اسم العميل غير موجود")),"validation should report rows with missing client names");
assert.ok(staged.some(row=>row.warnings.some(warning=>warning.includes("مكرر"))),"duplicate phone/code rows should be flagged");
const phones=data.slice(1).map(row=>splitPhones(row[mapping.phone])[0]);
const duplicatePhoneCount=phones.length-new Set(phones).size;
assert.ok(duplicatePhoneCount>0,"duplicate phone numbers should be detectable in the parsed rows");
const blankRowsSkipped=rows.filter(row=>row.length===0).length;
assert.ok(blankRowsSkipped>0,"fixture should contain blank rows");
console.log(JSON.stringify({status:"passed",fileBytes:buffer.length.toLocaleString(),sheets:parsed.SheetNames.length,parsedRows:data.length,validatedRows:staged.length,invalidRows:staged.filter(row=>row.errors.length).length,blankRowsInSource:blankRowsSkipped,duplicatePhoneRows:duplicatePhoneCount,arabicHeaderMapping:"passed",arabicNumbersAndKwd:"passed",mixedPhoneFormats:"passed",mergedCells:"passed"},null,2));
