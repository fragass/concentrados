
async function api(url){
const r=await fetch(url,{credentials:"include"})
return r.json()
}

async function load(){
const res=await api("/api/auth/me")

if(!res.authenticated){
location.href="/"
return
}

userBox.innerText=res.user.email
}

logoutBtn.onclick=async()=>{
await fetch("/api/auth/logout",{method:"POST"})
location.href="/"
}

load()
