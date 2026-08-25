/* Exportiert den aufgeloesten Kontext der App (Journal-Zuordnung, Flaechen, Regeln)
   nach tools/_kontext.json, damit die Statistik in Python exakt dieselbe Logik
   verwendet wie die App selbst - statt sie nachzubauen und dabei abzuweichen. */
const {chromium}=require('playwright');
const fs=require('fs');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html'); await pg.waitForTimeout(1200);
  const k=await pg.evaluate(()=>{
    const felder={};
    Store.db.felder.forEach(f=>{
      felder[f.id]={ name:f.name, standortId:f.standortId, standort:Store.standort(f.standortId)?.name,
        gesamtflaecheAren:f.gesamtflaecheAren??null, bewaessert:f.bewaessert!==false,
        flaecheM2:Store.feldFlaecheM2(f),
        schiffe:f.schiffe.map(s=>({id:s.id, nummer:String(s.nummer), implizit:!!s.implizit,
          aren:s.aren??null, laengeM:s.laengeM??null, breiteM:s.breiteM??null,
          flaecheM2:Store.schiffFlaecheM2(s,f), polyFlaecheRel:polyArea(s.polygon)})) };
    });
    return {
      journalMap: Store.db.einstellungen.journalMap,
      sprenkler: Store.db.einstellungen.sprenkler,
      felder,
      regeln: Store.db.regeln,
      gruppen: Store.db.gruppen,
      kulturen: Object.fromEntries(Store.db.kulturen.map(k=>[k.id,k.name])),
      standorte: Object.fromEntries(Store.db.standorte.map(s=>[s.id,s.name]))
    };
  });
  fs.writeFileSync('tools/_kontext.json', JSON.stringify(k,null,1));
  console.log('tools/_kontext.json geschrieben ·',
    Object.keys(k.journalMap).length,'Journal-Zuordnungen ·',
    Object.keys(k.felder).length,'Felder');
  await b.close();
})();
