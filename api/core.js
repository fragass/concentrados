
exports.searchUsers=async(req,res)=>{
 res.json([{username:'admin'},{username:'jean'}]);
};

exports.sendMessage=async(req,res)=>{
 res.json({ok:true});
};

exports.listMessages=async(req,res)=>{
 res.json([]);
};

exports.ping=async(req,res)=>{
 res.json({ok:true});
};
