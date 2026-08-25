/* ============================================================
   APP — Einstieg und Rollenwechsel
   ============================================================ */
const App = {
  enter(rolle){
    $('#start').style.display='none';
    $('#adminShell').classList.remove('on'); $('#wmShell').classList.remove('on');
    if(rolle==='admin'){ $('#adminShell').classList.add('on'); Admin.open(); }
    else { $('#wmShell').classList.add('on'); WM.open(); }
  },
  home(){
    if(typeof Setup!=='undefined' && Setup.aktiv){ Setup.aktiv=false; }
    const sk=document.getElementById('setupSkip'); if(sk) sk.remove();
    closeModal();
    $('#adminShell').classList.remove('on'); $('#wmShell').classList.remove('on');
    $('#start').style.display='flex'; this.refreshStart();
  },
  refreshStart(){
    const d=Store.db;
    const sek=Store.sektoren().filter(s=>s.sektor.kulturId).length;
    const frei=Object.values(d.plan||{}).filter(p=>p.freigegeben).length;
    $('#startStat').textContent = `${d.standorte.length} Standorte · ${d.felder.length} Felder · `+
      `${d.felder.reduce((a,f)=>a+f.schiffe.length,0)} Schiffe · ${sek} Kulturen gesetzt · ${frei} Tage freigegeben`;
  }
};

/* ---------- Startdaten laden ---------- */
(function boot(){
  const seed=JSON.parse(document.getElementById('seedData').textContent);
  Store.init(seed);
  Store.db.einstellungen.journalMap = Engine.autoMap();
  Engine.planNeu();
  App.refreshStart();
})();
</script>
</body>
</html>

