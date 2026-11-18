"use client";
import { createClient } from "@/lib/neon/client";

export type ClientRecord={id:string;name:string;phones:string[];source:string;notes:string;assignedTo:string;createdAt:string;tags:string[]};

export async function fetchClients():Promise<ClientRecord[]>{
  const neon=createClient();
  const {data,error}=await neon.from("clients").select("id,name,source,notes,tags,created_at,assigned_to").is("deleted_at",null).order("created_at",{ascending:false}).limit(5000);
  if(error) throw error;
  const rows=(data??[]) as {id:string;name:string;source:string|null;notes:string|null;tags:string[];created_at:string;assigned_to:string|null}[];
  if(!rows.length)return [];
  return rows.map(row=>({id:row.id,name:row.name,phones:[],source:row.source??"",notes:row.notes??"",assignedTo:row.assigned_to??"",createdAt:row.created_at,tags:row.tags??[]}));
}

export async function revealClientContact(id:string,comment:string):Promise<string[]> {
  const {data,error}=await createClient().rpc("reveal_client_contact",{p_client_id:id,p_comment:comment});
  if(error) throw error;
  return ((data??[]) as {phone:string}[]).map(row=>row.phone);
}

export async function archiveClient(id:string,comment:string){
  const {error}=await createClient().rpc("archive_client",{p_client_id:id,p_comment:comment});
  if(error)throw error;
}

export async function createClientRecord(client:Pick<ClientRecord,"name"|"phones"|"source"|"notes"|"tags">){
  const neon=createClient();
  const {error}=await neon.rpc("create_client_with_phones",{payload:client});
  if(error)throw error;
}
