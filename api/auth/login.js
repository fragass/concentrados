
const supabaseClient=require("../_lib/supabase")

module.exports=async(req,res)=>{

if(req.method!=="POST"){
return res.status(405).end()
}

const {email,password}=req.body

const supabase=supabaseClient()

const {data,error}=await supabase.auth.signInWithPassword({email,password})

if(error){
return res.status(401).json({success:false,message:error.message})
}

res.setHeader("Set-Cookie","token="+data.session.access_token+"; Path=/; HttpOnly")

res.json({success:true})
}
