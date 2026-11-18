"use client";

import type { Property } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type LookupRow = { id:string; type:string; name_ar:string };
type PropertyRow = { id:string; code:string; client_id:string|null; type_id:string|null; offer_type_id:string|null; area_id:string|null; location_type_id:string|null; block:string|null; plot:string|null; street:string|null; area_m2:number|null; asking_price_kwd:number|null; assigned_to:string|null; status:Property["status"]; entry_date:string; details:string|null };

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function fetchProperties(): Promise<Property[]> {
  const supabase=createClient();
  const {data: raw,error}=await supabase.from("properties_safe").select("*").order("entry_date",{ascending:false}).limit(5000);
  if(error) throw error;
  const rows=(raw??[]) as unknown as PropertyRow[];
  if(!rows.length) return [];
  const ids=rows.map(row=>row.id);
  const clientIds=[...new Set(rows.flatMap(row=>row.client_id?[row.client_id]:[]))];
  const employeeIds=[...new Set(rows.flatMap(row=>row.assigned_to?[row.assigned_to]:[]))];
  const [lookupsResult,clientsResult,employeesResult,phonesResult]=await Promise.all([
    supabase.from("lookups").select("id,type,name_ar"),
    clientIds.length?supabase.from("clients").select("id,name").in("id",clientIds):Promise.resolve({data:[],error:null}),
    employeeIds.length?supabase.from("profiles").select("id,full_name").in("id",employeeIds):Promise.resolve({data:[],error:null}),
    supabase.from("property_phones").select("property_id,phone,position").in("property_id",ids).order("position"),
  ]);
  if(lookupsResult.error) throw lookupsResult.error;
  if(clientsResult.error) throw clientsResult.error;
  if(employeesResult.error) throw employeesResult.error;
  if(phonesResult.error) throw phonesResult.error;
  const lookups=new Map(((lookupsResult.data??[]) as LookupRow[]).map(x=>[x.id,x.name_ar]));
  const clients=new Map(((clientsResult.data??[]) as {id:string;name:string}[]).map(x=>[x.id,x.name]));
  const employees=new Map(((employeesResult.data??[]) as {id:string;full_name:string}[]).map(x=>[x.id,x.full_name]));
  const phones=new Map<string,string[]>();
  for(const row of (phonesResult.data??[]) as {property_id:string;phone:string}[]){phones.set(row.property_id,[...(phones.get(row.property_id)??[]),row.phone]);}
  return rows.map(row=>({id:row.id,code:row.code,client:row.client_id?(clients.get(row.client_id)??"عميل غير معروف"):"غير مسجل",phones:phones.get(row.id)??[],type:row.type_id?(lookups.get(row.type_id)??"غير محدد"):"غير محدد",offer:row.offer_type_id?(lookups.get(row.offer_type_id)??"—"):"—",area:row.area_id?(lookups.get(row.area_id)??"غير محدد"):"غير محدد",block:row.block??"",plot:row.plot??"",street:row.street??"",locationType:row.location_type_id?(lookups.get(row.location_type_id)??""):"",size:Number(row.area_m2??0),price:row.asking_price_kwd===null?null:Number(row.asking_price_kwd),employee:row.assigned_to?(employees.get(row.assigned_to)??"غير معيّن"):"غير معيّن",status:row.status,date:row.entry_date,details:row.details??""}));
}

export async function createProperty(property:Property) {
  const supabase=createClient();
  const {error}=await supabase.rpc("create_property_with_client",{payload:{code:property.code,client:property.client,phones:property.phones,type:property.type,offer:property.offer,area:property.area,block:property.block,plot:property.plot,street:property.street,location_type:property.locationType,size:property.size,price:property.price,employee:property.employee,details:property.details}});
  if(error) throw error;
}

export async function updatePropertyStatus(id:string,status:Property["status"]){const db=createClient();const {error}=await db.rpc("update_property_status",{property_id:id,new_status:status});if(error)throw error;}

export async function archiveProperty(id:string){const db=createClient();const {error}=await db.rpc("archive_property",{property_id:id});if(error)throw error;}
