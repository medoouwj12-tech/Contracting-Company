"use client";
import { createClient } from "@/lib/neon/client";

export type ClientAddress={governorate:string;area:string;sector:string;distribution:string;block:string;street:string;avenue:string;building:string;floor:string;apartment:string;postalCode:string;landmark:string};
export const emptyClientAddress:ClientAddress={governorate:"",area:"",sector:"",distribution:"",block:"",street:"",avenue:"",building:"",floor:"",apartment:"",postalCode:"",landmark:""};
export type ClientComment={id:string;body:string;authorName:string;createdAt:string};
export type ClientClaim={employeeId:string;employeeName:string;claimedAt:string};
export type ClientRecord={id:string;name:string;phones:string[];source:string;notes:string;assignedTo:string;createdAt:string;tags:string[];address?:ClientAddress;claim?:ClientClaim|null;comments?:ClientComment[]};

export async function fetchClients():Promise<ClientRecord[]>{
  const neon=createClient();
  const {data,error}=await neon.from("clients").select("id,name,source,notes,tags,address,created_at,assigned_to").is("deleted_at",null).order("created_at",{ascending:false}).limit(5000);
  if(error) throw error;
  const rows=(data??[]) as {id:string;name:string;source:string|null;notes:string|null;tags:string[];address:Partial<ClientAddress>|null;created_at:string;assigned_to:string|null}[];
  if(!rows.length)return [];
  const [claimResult,commentResult]=await Promise.all([neon.rpc("list_active_client_claims"),neon.rpc("list_client_comments")]);
  if(claimResult.error)throw claimResult.error;if(commentResult.error)throw commentResult.error;
  const claims=(claimResult.data??[]) as {client_id:string;employee_id:string;employee_name:string;claimed_at:string}[];
  const comments=(commentResult.data??[]) as {id:string;client_id:string;body:string;author_name:string;created_at:string}[];
  return rows.map(row=>({id:row.id,name:row.name,phones:[],source:row.source??"",notes:row.notes??"",assignedTo:row.assigned_to??"",createdAt:row.created_at,tags:row.tags??[],address:{...emptyClientAddress,...(row.address??{})},claim:(()=>{const claim=claims.find(x=>x.client_id===row.id);return claim?{employeeId:claim.employee_id,employeeName:claim.employee_name,claimedAt:claim.claimed_at}:null})(),comments:comments.filter(x=>x.client_id===row.id).map(x=>({id:x.id,body:x.body,authorName:x.author_name,createdAt:x.created_at}))}));
}

export async function claimClient(id:string){const {error}=await createClient().rpc("claim_client",{p_client_id:id});if(error)throw error;}
export async function releaseClient(id:string){const {error}=await createClient().rpc("release_client_claim",{p_client_id:id});if(error)throw error;}
export async function addClientComment(id:string,body:string){const {error}=await createClient().rpc("add_client_comment",{p_client_id:id,p_body:body});if(error)throw error;}

export async function revealClientContact(id:string,comment:string):Promise<string[]> {
  const {data,error}=await createClient().rpc("reveal_client_contact",{p_client_id:id,p_comment:comment});
  if(error) throw error;
  return ((data??[]) as {phone:string}[]).map(row=>row.phone);
}

export async function archiveClient(id:string,comment:string){
  const {error}=await createClient().rpc("archive_client",{p_client_id:id,p_comment:comment});
  if(error)throw error;
}

export async function createClientRecord(client:Pick<ClientRecord,"name"|"phones"|"source"|"notes"|"tags"|"address">){
  const neon=createClient();
  const {data,error}=await neon.rpc("create_client_with_address",{payload:client});
  if(error)throw error;
  return data as string;
}
