"use client";
import { createClient } from "@/lib/supabase/client";

export type ClientRecord={id:string;name:string;phones:string[];source:string;notes:string;assignedTo:string;createdAt:string;tags:string[]};

export async function fetchClients():Promise<ClientRecord[]>{
  const supabase=createClient();
  const {data,error}=await supabase.from("clients").select("id,name,source,notes,tags,created_at,assigned_to").is("deleted_at",null).order("created_at",{ascending:false}).limit(5000);
  if(error) throw error;
  const rows=(data??[]) as {id:string;name:string;source:string|null;notes:string|null;tags:string[];created_at:string;assigned_to:string|null}[];
  if(!rows.length)return [];
  const {data:phoneRows,error:phoneError}=await supabase.from("client_phones").select("client_id,phone").in("client_id",rows.map(r=>r.id)).order("is_primary",{ascending:false});
  if(phoneError)throw phoneError;
  const phones=new Map<string,string[]>();
  for(const row of (phoneRows??[]) as {client_id:string;phone:string}[])phones.set(row.client_id,[...(phones.get(row.client_id)??[]),row.phone]);
  return rows.map(row=>({id:row.id,name:row.name,phones:phones.get(row.id)??[],source:row.source??"",notes:row.notes??"",assignedTo:row.assigned_to??"",createdAt:row.created_at,tags:row.tags??[]}));
}

export async function createClientRecord(client:Pick<ClientRecord,"name"|"phones"|"source"|"notes"|"tags">){
  const supabase=createClient();
  const {error}=await supabase.rpc("create_client_with_phones",{payload:client});
  if(error)throw error;
}
