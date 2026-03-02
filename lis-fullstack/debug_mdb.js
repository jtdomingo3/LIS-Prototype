const fs = require('fs');
(async function() {
  try {
    let mod = require('mdb-reader');
    const MDBReader = mod && mod.default ? mod.default : mod;
    const buf = fs.readFileSync('\\\\192.168.31.86\\new-gezyne\\DataBase\\Analyser.MDB');
    const r = new MDBReader(buf);
    const tables = r.getTableNames().filter(n => /^CHECK_RESULT/i.test(n));
    console.log('tables', tables.slice(0,5));
    for (const t of tables.slice(0,3)) {
      const rows = r.getTable(t).getData({ start: 0, length: 3 });
      console.log('table', t, rows);
      const mapped = rows.map(r => {
        let dt = r.CHECK_DATE || r.CHECKDATE || r.CHECK_DATE || r.DATE || r.Date || r.date;
        if (dt && dt instanceof Date) dt = dt.toISOString();
        return {
          DATE: dt,
          ITEM: r.ITEM || r.Item || r.item,
          RESULT: r.RESULT || r.Result || r.result,
          UNIT: r.UNIT || r.Unit || r.unit
        };
      });
      console.log('mapped sample', mapped);
    }
  } catch (e) {
    console.error('error', e);
  }
})();
