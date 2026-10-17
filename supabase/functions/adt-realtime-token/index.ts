import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT } from "https://deno.land/x/jose@v4.15.5/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("ADT_REALTIME_JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET") || "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false, autoRefreshToken:false } });

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}});
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return json({ok:true});
  if(req.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!JWT_SECRET) return json({error:'ADT_REALTIME_JWT_SECRET_NOT_CONFIGURED'},503);
  try{
    const body=await req.json();
    const teamId=String(body?.team_id||'').trim();
    const userId=String(body?.user_id||'').trim();
    const deviceId=String(body?.device_id||'').trim();
    const deviceSecret=String(body?.device_secret||'');
    if(!teamId||!userId||!deviceId||deviceSecret.length<32) return json({error:'INVALID_REALTIME_IDENTITY'},400);

    const {data:allowed,error:verifyError}=await admin.rpc('adt_realtime_verify_device_v320',{
      p_team_id:teamId,
      p_user_id:userId,
      p_device_id:deviceId,
      p_device_secret:deviceSecret
    });
    if(verifyError) throw verifyError;
    if(allowed!==true) return json({error:'REALTIME_NOT_ALLOWED'},403);

    const now=Math.floor(Date.now()/1000), expires=now+15*60;
    const secret=new TextEncoder().encode(JWT_SECRET);
    const token=await new SignJWT({
      role:'authenticated',
      aud:'authenticated',
      adt_team_id:teamId,
      adt_user_id:userId,
      adt_device_id:deviceId
    }).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(userId).setIssuedAt(now).setExpirationTime(expires).sign(secret);
    return json({token,expires_at:expires});
  }catch(e){return json({error:String((e as Error)?.message||e||'TOKEN_ISSUE_FAILED')},500);}
});
