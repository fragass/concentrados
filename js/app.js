
async function api(path,opts={}){
 const res=await fetch('/api/'+path,opts);
 return res.json();
}

function send(){
 const m=document.getElementById("msg").value;
 if(!m)return;
 const box=document.getElementById("messages");
 const d=document.createElement("div");
 d.textContent=m;
 box.appendChild(d);
 document.getElementById("empty").style.display="none";
 document.getElementById("msg").value="";
}
