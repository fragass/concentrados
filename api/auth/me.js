
const {createClient}=require("@supabase/supabase-js")

module.exports=async(req,res)=>{

const token=req.headers.cookie?.split("token=")[1]

if(!token){
return res.json({authenticated:false})
}

const supabase=createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_ANON_KEY,
{global:{headers:{Authorization:`Bearer ${token}`}}}
)

const {data}=await supabase.auth.getUser()

if(!data?.user){
return res.json({authenticated:false})
}

res.json({
authenticated:true,
user:data.user
})
}
