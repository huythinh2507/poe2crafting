const fs=require('fs');
const rd=(f,p)=>JSON.parse(fs.readFileSync(__dirname+'/../data/'+f,'utf8').replace(p,'').replace(/;\s*$/,''));
exports.o=rd('data.json',/^coedata=/);exports.L=rd('english.json',/^coelang=/);
