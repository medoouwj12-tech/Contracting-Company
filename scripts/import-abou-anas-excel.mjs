import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import pg from "pg";
import XLSX from "xlsx";

nextEnv.loadEnvConfig(process.cwd());

const filePath = process.argv[2];
if (!filePath) throw new Error("Usage: node scripts/import-abou-anas-excel.mjs <xlsx-path>");
const workbookBytes = await readFile(filePath);
const fileSha256 = createHash("sha256").update(workbookBytes).digest("hex");
const workbook = XLSX.read(workbookBytes, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
const headers = (matrix.shift() ?? []).map((value, index) => value == null || String(value).trim() === "" ? `_column_${index + 1}` : String(value).trim());
const sourceRows = [];
let blankRows = 0;
for (let i = 0; i < matrix.length; i++) {
  const values = matrix[i] ?? [];
  if (!values.some(value => value !== null && value !== undefined && value !== "")) { blankRows++; continue; }
  const source = Object.fromEntries(headers.map((key, index) => [key, values[index] ?? null]));
  sourceRows.push({ sourceRowNumber: i + 2, source, fingerprint: createHash("sha256").update(JSON.stringify(headers.map(key => source[key]))).digest("hex") });
}

const toDigits = value => String(value ?? "").replace(/[٠-٩۰-۹]/g, digit => String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10)).replace(/\D/g, "");
const normalizePhone = value => {
  let digits = toDigits(value);
  if (digits.startsWith("00965")) digits = digits.slice(5);
  else if (digits.startsWith("965") && digits.length > 8) digits = digits.slice(3);
  return digits;
};
const phoneColumns = headers.filter(header => header.startsWith("هاتف العميل"));
const safeSource = source => Object.fromEntries(Object.entries(source).map(([key, value]) => [key, phoneColumns.includes(key) && value != null && String(value).trim() !== "" ? "محفوظ ضمن بيانات التواصل المحمية" : value]));
const parent = new Map();
const find = value => { if (!parent.has(value)) parent.set(value, value); const current = parent.get(value); if (current !== value) parent.set(value, find(current)); return parent.get(value); };
const union = (left, right) => { left = find(left); right = find(right); if (left !== right) parent.set(right, left); };
const rowPhones = new Map();
const groupNames = new Map();
const groupPhones = new Map();
for (const row of sourceRows) {
  const phones = [...new Map(phoneColumns.map(column => [normalizePhone(row.source[column]), { raw: row.source[column], normalized: normalizePhone(row.source[column]) }]).filter(([normalized]) => normalized)).values()];
  rowPhones.set(row.sourceRowNumber, phones);
  for (const phone of phones) find(phone.normalized);
  for (const phone of phones.slice(1)) union(phones[0].normalized, phone.normalized);
}
for (const row of sourceRows) {
  const rowPhoneList = rowPhones.get(row.sourceRowNumber) ?? [];
  const root = rowPhoneList.length ? find(rowPhoneList[0].normalized) : `row-${row.sourceRowNumber}`;
  const names = groupNames.get(root) ?? [];
  const name = String(row.source["اسم العميل"] ?? "").trim();
  if (name && !names.includes(name)) names.push(name);
  groupNames.set(root, names);
  const phones = groupPhones.get(root) ?? new Map();
  for (const phone of rowPhoneList) if (!phones.has(phone.normalized)) phones.set(phone.normalized, phone.raw);
  groupPhones.set(root, phones);
  row.clientRoot = root;
}

const duplicateFingerprints = new Set();
let exactDuplicateRows = 0;
for (const row of sourceRows) { if (duplicateFingerprints.has(row.fingerprint)) exactDuplicateRows++; else duplicateFingerprints.add(row.fingerprint); }
const uniquePropertyRows = sourceRows.length;
const clientRoots = [...new Set(sourceRows.map(row => row.clientRoot))];
console.log(JSON.stringify({ sheetName, populatedRows: sourceRows.length, blankRows, uniqueProperties: uniquePropertyRows, exactDuplicateRows, clientGroups: clientRoots.length }));

if (process.argv.includes("--dry-run")) process.exit(0);

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to import this workbook into Neon.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 600_000 });
await client.connect();
try {
  await client.query("begin");
  const existingBatch = await client.query("select id from public.excel_import_batches where file_sha256=$1", [fileSha256]);
  if (existingBatch.rowCount) throw new Error("This workbook was already imported into Neon.");
  const existingCounts = await client.query("select (select count(*) from public.clients where deleted_at is null)::int as clients,(select count(*) from public.properties where deleted_at is null)::int as properties");
  if (existingCounts.rows[0].clients || existingCounts.rows[0].properties) throw new Error("The live client/property tables are not empty; refusing to merge this source without a review.");
  const adminResult = await client.query("select p.id from public.profiles p join public.roles r on r.id=p.role_id where r.name='super_admin' order by p.created_at limit 1");
  if (!adminResult.rowCount) throw new Error("No super_admin profile exists in Neon for import attribution.");
  const importedBy = adminResult.rows[0].id;
  const lookupRows = (await client.query("select id,type,code,name_ar from public.lookups where type in ('property_type','offer_type','area')")).rows;
  const lookupId = new Map(lookupRows.map(row => [`${row.type}\u0000${row.name_ar}`, row.id]));
  const maxCode = new Map();
  for (const row of lookupRows) maxCode.set(row.type, Math.max(maxCode.get(row.type) ?? 0, Number(row.code)));
  const getLookup = async (type, name) => {
    if (!name) return null;
    const key = `${type}\u0000${name}`;
    if (lookupId.has(key)) return lookupId.get(key);
    const code = (maxCode.get(type) ?? 0) + 1;
    const result = await client.query("insert into public.lookups(type,code,name_ar) values($1,$2,$3) returning id", [type, code, name]);
    maxCode.set(type, code); lookupId.set(key, result.rows[0].id); return result.rows[0].id;
  };
  const propertyTypeId = await getLookup("property_type", "أرض");
  const offerTypeId = await getLookup("offer_type", "معروض للبدل");
  const areaIds = new Map();
  for (const row of sourceRows) {
    const area = String(row.source["المنطقة"] ?? "").trim();
    if (area && !areaIds.has(area)) areaIds.set(area, await getLookup("area", area));
  }
  const batchId = randomUUID();
  await client.query("insert into public.excel_import_batches(id,file_sha256,file_name,sheet_name,source_rows,blank_rows,unique_properties,exact_duplicate_rows,client_groups,imported_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [batchId, fileSha256, filePath.split(/[\\/]/).pop(), sheetName, sourceRows.length, blankRows, uniquePropertyRows, exactDuplicateRows, clientRoots.length, importedBy]);

  const clientIdByRoot = new Map(clientRoots.map(root => [root, randomUUID()]));
  const clientRecords = clientRoots.map(root => {
    const names = groupNames.get(root) ?? [];
    return { id: clientIdByRoot.get(root), name: names[0] || "عميل بدون اسم", source_names: names.slice(1), created_by: importedBy };
  });
  const insertChunks = async (records, sql, size = 500) => {
    for (let i = 0; i < records.length; i += size) await client.query(sql, [JSON.stringify(records.slice(i, i + size))]);
  };
  await insertChunks(clientRecords, `insert into public.clients(id,name,source_names,assigned_to,created_by) select x.id,x.name,x.source_names,null,x.created_by from jsonb_to_recordset($1::jsonb) as x(id uuid,name text,source_names text[],created_by text)`);

  const clientPhones = [];
  for (const root of clientRoots) {
    const phones = [...(groupPhones.get(root) ?? new Map()).entries()];
    phones.forEach(([normalized, phone], index) => clientPhones.push({ id: randomUUID(), client_id: clientIdByRoot.get(root), phone: String(phone), normalized_phone: normalized, label: null, is_primary: index === 0 }));
  }
  await insertChunks(clientPhones, `insert into public.client_phones(id,client_id,phone,normalized_phone,label,is_primary) select x.id,x.client_id,x.phone,x.normalized_phone,x.label,x.is_primary from jsonb_to_recordset($1::jsonb) as x(id uuid,client_id uuid,phone text,normalized_phone text,label text,is_primary boolean)`);

  const propertyRecords = sourceRows.map(row => {
    const value = (key, fallback = null) => row.source[key] == null || String(row.source[key]).trim() === "" ? fallback : String(row.source[key]).trim();
    const numeric = value("المساحة");
    const normalizedNumeric = numeric == null ? null : toDigits(numeric).replace(/,/g, "").replace(/[^0-9.\-]/g, "");
    return { id: randomUUID(), source_row: row.sourceRowNumber, fingerprint: row.fingerprint, client_id: clientIdByRoot.get(row.clientRoot), code: `XLS-${row.sourceRowNumber}`, type_id: propertyTypeId, offer_type_id: offerTypeId, area_id: areaIds.get(value("المنطقة")) ?? null, block: value("القطعة"), plot: value("القسيمة"), street: value("الشارع"), avenue: value("الجادة"), floor: value("الدور"), building_type: value("نوع المبنى"), area_m2: normalizedNumeric, details: value("التفاصيل"), notes: value("ملاحظات"), sector: value("القطاع"), rooms_details: value("تفاصيل الغرف"), source_excel: safeSource(row.source), created_by: importedBy };
  });
  await insertChunks(propertyRecords, `insert into public.properties(id,code,client_id,type_id,offer_type_id,location_type_id,area_id,block,plot,street,avenue,floor,building_type,area_m2,asking_price_kwd,details,notes,assigned_to,created_by,status,sector,distribution,rooms_details,source_excel) select x.id,x.code,x.client_id,x.type_id,x.offer_type_id,null,x.area_id,x.block,x.plot,x.street,x.avenue,x.floor,x.building_type,x.area_m2::numeric,null,x.details,x.notes,null,x.created_by,'available',x.sector,null,x.rooms_details,x.source_excel from jsonb_to_recordset($1::jsonb) as x(id uuid,code text,client_id uuid,type_id uuid,offer_type_id uuid,area_id uuid,block text,plot text,street text,avenue text,floor text,building_type text,area_m2 text,details text,notes text,sector text,rooms_details text,source_excel jsonb,created_by text)`);

  const propertyBySourceRow = new Map(propertyRecords.map(record => [record.source_row, record]));
  const propertyPhones = [];
  for (const row of sourceRows) {
    (rowPhones.get(row.sourceRowNumber) ?? []).slice(0, 5).forEach((phone, index) => propertyPhones.push({ id: randomUUID(), property_id: propertyBySourceRow.get(row.sourceRowNumber).id, phone: String(phone.raw), normalized_phone: phone.normalized, position: index + 1 }));
  }
  await insertChunks(propertyPhones, `insert into public.property_phones(id,property_id,phone,normalized_phone,position) select x.id,x.property_id,x.phone,x.normalized_phone,x.position from jsonb_to_recordset($1::jsonb) as x(id uuid,property_id uuid,phone text,normalized_phone text,position smallint)`);

  const importLinks = sourceRows.map(row => ({ batch_id: batchId, source_row_number: row.sourceRowNumber, row_fingerprint: row.fingerprint, client_id: clientIdByRoot.get(row.clientRoot), property_id: propertyBySourceRow.get(row.sourceRowNumber).id, is_exact_duplicate: false, source_data: safeSource(row.source) }));
  await insertChunks(importLinks, `insert into public.excel_import_rows(batch_id,source_row_number,row_fingerprint,client_id,property_id,is_exact_duplicate,source_data) select x.batch_id,x.source_row_number,x.row_fingerprint,x.client_id,x.property_id,x.is_exact_duplicate,x.source_data from jsonb_to_recordset($1::jsonb) as x(batch_id uuid,source_row_number integer,row_fingerprint text,client_id uuid,property_id uuid,is_exact_duplicate boolean,source_data jsonb)`);
  await client.query("commit");
  console.log(JSON.stringify({ imported: true, batchId, clients: clientRecords.length, properties: propertyRecords.length, clientPhones: clientPhones.length, propertyPhoneLinks: propertyPhones.length, sourceRows: importLinks.length }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
