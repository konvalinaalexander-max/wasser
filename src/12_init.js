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
    LANG='de';
    $('#adminShell').classList.remove('on'); $('#wmShell').classList.remove('on');
    $('#start').style.display='flex'; this.refreshStart();
  },
  refreshStart(){
    const d=Store.db;
    const pr=Engine.probleme();
    const frei=Object.values(d.plan||{}).filter(p=>p.freigegeben).length;
    $('#startStat').textContent = `${d.standorte.length} Standorte · ${d.felder.length} Felder · `+
      `${Store.schiffZahl()} Schiffe · ${pr.planbar} planbare Sektoren · ${frei} Tage freigegeben`;
  }
};

/* ---------- Startdaten laden ---------- */
(function boot(){
  const seed=JSON.parse(document.getElementById('seedData').textContent);
  Store.init(seed);
  /* Journal-Zuordnung nur schätzen, wo noch keine steht (ein Import bringt seine eigene mit) */
  const jm=Store.db.einstellungen.journalMap;
  if(!Object.keys(jm).length) Store.db.einstellungen.journalMap=Engine.autoMap();
  Engine.planNeu();
  Store.dirty=false;
  App.refreshStart();
})();
</script>
</body>
</html>
