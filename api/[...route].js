
const core = require('./core');

export default async function handler(req,res){
 const route=req.query.route||[];
 const path=route.join('/');

 try{

 if(path==='users/search') return core.searchUsers(req,res);
 if(path==='messages/send') return core.sendMessage(req,res);
 if(path==='messages/list') return core.listMessages(req,res);
 if(path==='presence/ping') return core.ping(req,res);

 res.status(404).json({error:'route not found'});

 }catch(e){
 console.error(e);
 res.status(500).json({error:'server'});
 }
}
