
const {createClient}=require("@supabase/supabase-js")

module.exports=function(){
return createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_ANON_KEY
)
}
