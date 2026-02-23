const fs=require('fs');
(async()=>{
  try{
    const mod=require('mdb-reader');
    const MDBReader=mod && mod.default ? mod.default : mod;
    const gezyne='\\\\192.168.31.86\\new-gezyne\\DataBase\\Analyser.MDB';
    const buf=fs.readFileSync(gezyne);
    const reader=new MDBReader(buf);
    const tables=reader.getTableNames();
    const codes=new Set();
    for(const t of tables){
      try{
        const rows=reader.getTable(t).getData({start:0,length:5000});
        rows.forEach(r=>{
          if(r.ITEM) codes.add(String(r.ITEM).trim());
        });
      }catch(e){/*ignore*/}
    }
    console.log('unique ITEM values count',codes.size);
    console.log(Array.from(codes).sort().join(', '));
  }catch(e){console.error(e);} 
})();