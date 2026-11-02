// Supabase Edge Function: collecter-sources
// Sources gratuites documentées : SportScore et API-Sports (clé facultative).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const norm=(v:string)=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const sports:Record<string,string>={Football:"football",Basketball:"basketball",Tennis:"tennis"};
const apiHosts:Record<string,string>={Football:"https://v3.football.api-sports.io",Basketball:"https://v1.basketball.api-sports.io",Hockey:"https://v1.hockey.api-sports.io",Handball:"https://v1.handball.api-sports.io",Volleyball:"https://v1.volleyball.api-sports.io"};
function names(x:any){const h=x?.home?.name||x?.teams?.home?.name||x?.home_team||x?.homeTeam||x?.strHomeTeam||x?.participants?.[0]?.name||"";const a=x?.away?.name||x?.teams?.away?.name||x?.away_team||x?.awayTeam||x?.strAwayTeam||x?.participants?.[1]?.name||"";return [String(h),String(a)];}
function isSame(x:any,home:string,away:string){const [h,a]=names(x);const hn=norm(home),an=norm(away),xh=norm(h),xa=norm(a);return !!(hn&&an&&xh&&xa)&&((xh.includes(hn)||hn.includes(xh))&&(xa.includes(an)||an.includes(xa)));}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service)return json({error:"Secrets Supabase manquants côté fonction."},500);
  const auth=req.headers.get("Authorization");if(!auth)return json({error:"Authentification requise."},401);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await userClient.auth.getUser();if(authError||!user)return json({error:"Session invalide."},401);
  const body=await req.json();const match_id=body?.match_id;if(!match_id)return json({error:"match_id obligatoire."},400);
  const admin=createClient(url,service);
  const {data:match,error:matchError}=await admin.from("matches").select("id,sport,competition,home_name,away_name,kickoff_at").eq("id",match_id).single();
  if(matchError||!match)return json({error:"Match introuvable ou colonnes matches non corrigées : "+(matchError?.message||"")},404);
  const sport=String(match.sport||"");const home=String(match.home_name||"");const away=String(match.away_name||"");
  if(!home||!away||!match.kickoff_at)return json({error:"Le match doit avoir deux équipes et une date valide."},400);
  const date=new Date(match.kickoff_at).toISOString().slice(0,10);const results:any[]=[];
  async function save(provider:string,items:any[],sourceUrl:string,statusCode:number){
   let count=0;
   for(const item of items.slice(0,25)){
    const [h,a]=names(item);const label=(h&&a)?`${h} – ${a}`:String(item?.name||item?.label||item?.event||"Donnée sportive liée à la rencontre");
    const {error}=await admin.from("match_source_facts").insert({match_id,provider,fact_type:"fixture_or_statistics",fact_text:label,source_url:sourceUrl,retrieved_at:new Date().toISOString(),verification_status:"unverified",reliability:"medium",raw_data:item});
    if(!error)count++;else console.error("insert match_source_facts",error.message);
   }
   const state=count?"success":"empty";
   await admin.from("provider_collection_runs").insert({match_id,provider,status:state,http_status:statusCode,records_count:count,message:count?"Données brutes enregistrées, à vérifier":"Aucune rencontre correspondante retournée"});
   results.push({provider,status:state,records:count,url:sourceUrl});
  }
  // SportScore : endpoints REST documentés, couverture football/basket/tennis.
  if(sports[sport]){
   const endpoint=`https://sportscore.com/api/v1/fixtures/?sport=${sports[sport]}&date=${date}&limit=200`;
   try{const r=await fetch(endpoint,{headers:{Accept:"application/json"}});const raw=await r.json();if(!r.ok)throw new Error(`HTTP ${r.status}`);const list=Array.isArray(raw)?raw:(raw.fixtures||raw.matches||raw.data||[]);const found=list.filter((x:any)=>isSame(x,home,away));await save("SportScore",found,endpoint,r.status);}
   catch(e){const message=String(e);await admin.from("provider_collection_runs").insert({match_id,provider:"SportScore",status:"error",message});results.push({provider:"SportScore",status:"error",message});}
  }else results.push({provider:"SportScore",status:"not_covered",message:"SportScore ne couvre pas ce sport dans le connecteur actuel."});
  // API-Sports : Football utilise /fixtures (pas /games). Les autres sports utilisent /games.
  const key=Deno.env.get("APISPORTS_KEY");
  if(apiHosts[sport]&&key){
   const endpoint=sport==="Football"?`${apiHosts[sport]}/fixtures?date=${date}`:`${apiHosts[sport]}/games?date=${date}`;
   try{const r=await fetch(endpoint,{headers:{"x-apisports-key":key,Accept:"application/json"}});const raw=await r.json();if(!r.ok)throw new Error(`HTTP ${r.status} — ${JSON.stringify(raw?.errors||{}).slice(0,300)}`);const list=raw.response||[];const found=list.filter((x:any)=>isSame(x,home,away));await save("API-Sports",found,endpoint,r.status);}
   catch(e){const message=String(e);await admin.from("provider_collection_runs").insert({match_id,provider:"API-Sports",status:"error",message});results.push({provider:"API-Sports",status:"error",message});}
  }else if(apiHosts[sport]&&!key)results.push({provider:"API-Sports",status:"needs_free_api_key",message:"Ajouter APISPORTS_KEY dans Supabase > Edge Functions > Secrets."});
  else results.push({provider:"API-Sports",status:"not_covered",message:"Aucun endpoint API-Sports configuré pour ce sport dans cette version."});
  return json({ok:true,match_id,sport,results,notice:"Collecte terminée. Les faits sont bruts et non vérifiés : ils ne constituent pas un pronostic automatique."});
 }catch(e){return json({error:String(e)},500);}
});
