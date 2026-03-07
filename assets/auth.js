
const tabs=document.querySelectorAll('.tab-btn')
const forms={
login:document.getElementById('loginForm'),
register:document.getElementById('registerForm')
}

tabs.forEach(btn=>{
btn.onclick=()=>{
tabs.forEach(b=>b.classList.remove('active'))
btn.classList.add('active')
Object.entries(forms).forEach(([k,f])=>{
f.classList.toggle('active',k===btn.dataset.tab)
})
}
})

async function api(url,data){
const r=await fetch(url,{
method:"POST",
headers:{"Content-Type":"application/json"},
credentials:"include",
body:JSON.stringify(data)
})
return r.json()
}

loginForm.onsubmit=async e=>{
e.preventDefault()

const email=loginEmail.value
const password=loginPassword.value

const res=await api("/api/auth/login",{email,password})

if(res.success){
location.href="/page1.html"
}else{
alert(res.message)
}
}

registerForm.onsubmit=async e=>{
e.preventDefault()

const name=registerName.value
const email=registerEmail.value
const password=registerPassword.value

const res=await api("/api/auth/register",{name,email,password})

if(res.success){
location.href="/page1.html"
}else{
alert(res.message)
}
}
