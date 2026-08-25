/* ============================================================
   PLANVIEW — SVG-Editor.
   Modi: 'view' | 'schiffe' | 'sektoren' | 'rohr' | 'kultur'
   Schnell beim Ziehen: während des Drags werden nur die
   betroffenen Knoten gepatcht, kein kompletter Neuaufbau.
   ============================================================ */
function pointInPoly(pt, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
    if(((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function distToSeg(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const l2=dx*dx+dy*dy; if(!l2) return Math.hypot(p[0]-a[0],p[1]-a[1]);
  let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2; t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
}
function distToPoly(p, poly){
  let m=Infinity;
  for(let i=0;i<poly.length;i++) m=Math.min(m, distToSeg(p, poly[i], poly[(i+1)%poly.length]));
  return m;
}
/* Rohr benennen: in einem Schiff → "3", in der Fahrgasse → "3/4" */
function rohrName(punkte, feld){
  if(!feld.schiffe.length) return '–';
  const mp=[(punkte[0][0]+punkte[punkte.length-1][0])/2, (punkte[0][1]+punkte[punkte.length-1][1])/2];
  const drin=feld.schiffe.filter(s=>pointInPoly(mp, s.polygon));
  if(drin.length===1) return String(drin[0].nummer);
  const sortiert=feld.schiffe.map(s=>({s, d:distToPoly(mp, s.polygon)})).sort((a,b)=>a.d-b.d);
  if(sortiert.length>=2 && Math.abs(sortiert[0].d-sortiert[1].d) < 0.025)
    return [sortiert[0].s.nummer, sortiert[1].s.nummer].join('/');
  return String(sortiert[0].s.nummer);
}
/* Viereck (oder bbox-Fallback) in n Streifen teilen — für Sektor-Aufteilung */
function teileInStreifen(poly, n, richtung){   // richtung: 'h' übereinander | 'v' nebeneinander
  const b=polyBBox(poly);
  const out=[];
  for(let i=0;i<n;i++){
    const a=i/n, c=(i+1)/n;
    const s = richtung==='v'
      ? [[b.x+b.w*a,b.y],[b.x+b.w*c,b.y],[b.x+b.w*c,b.y+b.h],[b.x+b.w*a,b.y+b.h]]
      : [[b.x,b.y+b.h*a],[b.x+b.w,b.y+b.h*a],[b.x+b.w,b.y+b.h*c],[b.x,b.y+b.h*c]];
    out.push(s.map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]));
  }
  return out;
}

function PlanView(opts){
  const NS='http://www.w3.org/2000/svg';
  const st = Store.standort(opts.standortId);
  const W=st.bildW, H=st.bildH;
  let modus = opts.modus || 'view';
  let selSchiff = opts.selected || null;
  let selSektor = opts.selectedSektor || null;
  let drawPts = null, dragging=null;

  const wrap = el('div','planwrap');
  const svg  = document.createElementNS(NS,'svg');
  svg.setAttribute('xmlns',NS);
  let vb = {x:0,y:0,w:W,h:H};
  if(opts.feldId && opts.zoomFeld!==false){
    const f=Store.feld(opts.feldId);
    const b=polyBBox(f.umriss.map(p=>[p[0]*W,p[1]*H]));
    const m=Math.max(b.w,b.h)*0.18;
    vb={x:b.x-m,y:b.y-m,w:b.w+2*m,h:b.h+2*m};
  }
  const applyVB=()=>svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  applyVB();
  svg.style.maxHeight=(opts.height||520)+'px';

  const img=document.createElementNS(NS,'image');
  img.setAttribute('href',st.bild); img.setAttribute('x',0); img.setAttribute('y',0);
  img.setAttribute('width',W); img.setAttribute('height',H);
  img.style.pointerEvents='none';
  svg.appendChild(img);
  const gFill=document.createElementNS(NS,'g');
  const gEdge=document.createElementNS(NS,'g');
  const gHand=document.createElementNS(NS,'g');
  [gFill,gEdge,gHand].forEach(g=>svg.appendChild(g));
  wrap.appendChild(svg);

  let skala=0;
  function px(n){
    if(!skala){ const m=svg.getScreenCTM(); if(m&&m.a) skala=m.a; }
    return skala ? n/skala : n*(vb.w/W);
  }
  function neuMessen(){
    const m=svg.getScreenCTM();
    if(m && m.a && Math.abs(m.a-skala) > (skala||1)*0.02){ skala=m.a; draw(); return true; }
    return false;
  }
  const felder = ()=> opts.feldId ? [Store.feld(opts.feldId)] : Store.felderVon(opts.standortId);
  const abs = poly => poly.map(p=>[p[0]*W,p[1]*H]);
  const rel = (x,y) => [ +(x/W).toFixed(4), +(y/H).toFixed(4) ];
  function svgPt(ev){
    const p=svg.createSVGPoint(); p.x=ev.clientX; p.y=ev.clientY;
    const m=svg.getScreenCTM(); if(!m) return {x:0,y:0};
    return p.matrixTransform(m.inverse());
  }
  function relFrom(ev){ const p=svgPt(ev); return rel(p.x,p.y); }
  function mk(tag, attrs, parent){
    const n=document.createElementNS(NS,tag);
    for(const k in attrs) n.setAttribute(k, attrs[k]);
    (parent||gFill).appendChild(n); return n;
  }

  /* Referenzen für schnelles Patchen während des Ziehens */
  let refs;

  function draw(){
    gFill.innerHTML=''; gEdge.innerHTML=''; gHand.innerHTML='';
    refs={ poly:{}, dots:{}, label:{}, sek:{}, sekDots:{}, rohr:{} };
    const hr=px(7), hitR=px(16), lw=px(2), fs=px(15), fsS=px(10.5);

    felder().forEach(f=>{
      if(opts.nurBewaessert && f.bewaessert===false) return;
      const aktiv = !opts.feldId || f.id===opts.feldId;

      f.schiffe.forEach(s=>{
        const P=abs(s.polygon);
        const sektMitKultur=(s.sektoren||[]).filter(k=>k.kulturId);
        const kult=sektMitKultur.length?Store.kultur(sektMitKultur[0].kulturId):null;
        const gewaehlt = selSchiff===s.id;
        const farbe = (opts.showKultur&&kult) ? kult.farbe : (aktiv?'#3F7A4C':'#9AA093');

        const poly=mk('polygon',{ points:P.map(p=>p.join(',')).join(' '), fill:farbe,
          'fill-opacity': gewaehlt?0.46:(aktiv?(kult&&opts.showKultur?0.34:0.15):0.07),
          stroke:farbe, 'stroke-width': gewaehlt?lw*1.7:lw, 'stroke-linejoin':'round'});
        refs.poly[s.id]=poly;
        poly.style.cursor='pointer';
        poly.addEventListener('click',ev=>{
          if(suppressClick) return;
          if(modus==='rohr') return;                       // Klick gehört dem Zeichnen
          ev.stopPropagation();
          selSchiff=s.id;
          if(modus!=='sektoren') selSektor=null;
          opts.onPick && opts.onPick(s,f,null);
          draw();
        });

        /* Sektoren mit Teilfläche */
        (s.sektoren||[]).forEach(k=>{
          if(!k.polygon||!k.polygon.length) return;
          const kk=k.kulturId?Store.kultur(k.kulturId):null;
          const A=abs(k.polygon);
          const sp=mk('polygon',{points:A.map(p=>p.join(',')).join(' '),
            fill:kk?kk.farbe:'#B3760F',
            'fill-opacity': selSektor===k.id?0.55:(kk?0.42:0.22),
            stroke: selSektor===k.id?'#1F211D':'#fff','stroke-width':px(selSektor===k.id?2:1.4)});
          refs.sek[k.id]=sp;
          if(modus==='sektoren'||modus==='kultur'){
            sp.style.cursor='pointer';
            sp.addEventListener('click',ev=>{
              if(suppressClick) return;
              ev.stopPropagation();
              selSchiff=s.id; selSektor=k.id;
              opts.onPick && opts.onPick(s,f,k);
              draw();
            });
          } else sp.style.pointerEvents='none';
          const c=polyCenter(A);
          const t=mk('text',{x:c[0],y:c[1],'text-anchor':'middle','dominant-baseline':'middle',
            class:'schiffLbl','font-size':fsS,fill:'#1F211D'});
          t.style.pointerEvents='none';
          t.textContent=(k.name||'')+(kk?' '+kk.name:'');
          /* Sektor-Griffe im Sektor-Modus */
          if(modus==='sektoren' && aktiv){
            refs.sekDots[k.id]=[];
            k.polygon.forEach((p,vi)=>{
              const hit=mk('circle',{cx:p[0]*W,cy:p[1]*H,r:hitR,fill:'rgba(0,0,0,0)'},gHand);
              const dot=mk('circle',{cx:p[0]*W,cy:p[1]*H,r:hr*0.85,fill:'#fff',stroke:'#B3760F',
                'stroke-width':px(2.2)},gHand);
              dot.style.pointerEvents='none';
              refs.sekDots[k.id].push({hit,dot});
              hit.style.cursor='grab';
              hit.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); ev.preventDefault();
                selSchiff=s.id; selSektor=k.id;
                dragging={typ:'sekvtx', sektor:k, i:vi};
                svg.style.cursor='grabbing';
                try{svg.setPointerCapture(ev.pointerId);}catch(e){} });
              hit.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation();
                if(k.polygon.length>3){ k.polygon.splice(vi,1); Store.mark(); draw();
                  opts.onChange&&opts.onChange(); }
                else toast('Ein Sektor braucht mindestens 3 Punkte'); });
            });
          }
        });

        /* Rohre */
        (s.rohre||[]).forEach(r=>{
          const A=abs(r.punkte);
          const pts=A.map(p=>p.join(',')).join(' ');
          const halo=mk('polyline',{points:pts,fill:'none',stroke:'#fff',
            'stroke-width':px(5.2),'stroke-linecap':'round','stroke-linejoin':'round','stroke-opacity':.9});
          const line=mk('polyline',{points:pts,fill:'none',stroke:'#1D5A78',
            'stroke-width':px(2.7),'stroke-linecap':'round','stroke-linejoin':'round'});
          const ends=[A[0],A[A.length-1]].map(p=>mk('circle',{cx:p[0],cy:p[1],r:px(4.5),fill:'#fff',
            stroke:'#1D5A78','stroke-width':px(1.8)}));
          let lbl=null;
          if(r.name){
            const c=A[Math.floor(A.length/2)];
            lbl=mk('text',{x:c[0],y:c[1]-px(9),'text-anchor':'middle',class:'schiffLbl',
              'font-size':fsS,fill:'#1D5A78'}); lbl.textContent='Rohr '+r.name;
          }
          refs.rohr[r.id]={halo,line,ends,lbl};
          if(modus==='rohr' && aktiv){
            r.punkte.forEach((p,pi)=>{
              const hit=mk('circle',{cx:p[0]*W,cy:p[1]*H,r:hitR,fill:'rgba(0,0,0,0)'},gHand);
              hit.style.cursor='grab';
              hit.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); ev.preventDefault();
                dragging={typ:'rohr', schiff:s, rohr:r, i:pi};
                svg.style.cursor='grabbing';
                try{svg.setPointerCapture(ev.pointerId);}catch(e){} });
              hit.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation();
                if(r.punkte.length>2){ r.punkte.splice(pi,1); Store.mark(); draw(); }
                else { s.rohre=s.rohre.filter(x=>x.id!==r.id); Store.mark(); draw();
                  opts.onChange&&opts.onChange(); }});
            });
          }
        });

        /* Beschriftung */
        if(aktiv){
          const c=polyCenter(P);
          const t=mk('text',{x:c[0],y:c[1],'text-anchor':'middle','dominant-baseline':'middle',
            class:'schiffLbl','font-size':fs,fill:'#1F211D'});
          t.style.pointerEvents='none'; t.textContent=s.nummer;
          refs.label[s.id]=t;
          if(opts.showKultur&&kult&&!(s.sektoren||[]).some(k=>k.polygon)){
            const t2=mk('text',{x:c[0],y:c[1]+fs*0.95,'text-anchor':'middle',class:'schiffLbl',
              'font-size':fsS,fill:'#1F211D'});
            t2.style.pointerEvents='none'; t2.textContent=kult.name;
          }
        }

        /* Schiff-Griffe */
        if(modus==='schiffe' && aktiv){
          s.polygon.forEach((p,i)=>{
            const q=s.polygon[(i+1)%s.polygon.length];
            const ln=mk('line',{x1:p[0]*W,y1:p[1]*H,x2:q[0]*W,y2:q[1]*H,
              stroke:'rgba(0,0,0,0)','stroke-width':px(13)}, gEdge);
            ln.style.cursor='copy';
            ln.addEventListener('dblclick',ev=>{ ev.preventDefault(); ev.stopPropagation();
              s.polygon.splice(i+1,0,relFrom(ev)); Store.mark(); draw(); opts.onChange&&opts.onChange(); });
            ln.addEventListener('click',ev=>{ if(suppressClick) return;
              ev.stopPropagation(); selSchiff=s.id; opts.onPick&&opts.onPick(s,f,null); draw(); });
          });
          refs.dots[s.id]=[];
          s.polygon.forEach((p,vi)=>{
            const cx=p[0]*W, cy=p[1]*H;
            const hit=mk('circle',{cx,cy,r:hitR,fill:'rgba(0,0,0,0)'}, gHand);
            const dot=mk('circle',{cx,cy,r:hr,fill:'#fff',stroke:farbe,'stroke-width':px(2.2)}, gHand);
            dot.style.pointerEvents='none';
            refs.dots[s.id].push({hit,dot});
            hit.style.cursor='grab';
            hit.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); ev.preventDefault();
              selSchiff=s.id;
              dragging={typ:'vtx', schiff:s, i:vi};
              svg.style.cursor='grabbing';
              try{svg.setPointerCapture(ev.pointerId);}catch(e){} });
            hit.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation();
              if(s.polygon.length>3){ s.polygon.splice(vi,1); Store.mark(); draw(); opts.onChange&&opts.onChange(); }
              else toast('Ein Polygon braucht mindestens 3 Punkte'); });
          });
        }
      });

      if(aktiv||!opts.feldId){
        const u=mk('polygon',{points:abs(f.umriss).map(p=>p.join(',')).join(' '),fill:'none',
          stroke:aktiv?'#2F5D3A':'#8A9083','stroke-width':px(1.6),
          'stroke-dasharray':px(6)+' '+px(4),opacity:aktiv?.55:.25});
        u.style.pointerEvents='none';
      }
    });

    /* laufende Zeichnung */
    if(drawPts&&drawPts.length){
      const A=drawPts.map(p=>[p[0]*W,p[1]*H]);
      const pl=mk('polyline',{points:A.map(p=>p.join(',')).join(' '),fill:'none',
        stroke:'#B3760F','stroke-width':px(2.6),'stroke-linecap':'round'});
      pl.style.pointerEvents='none';
      A.forEach(p=>{ const c=mk('circle',{cx:p[0],cy:p[1],r:px(4.5),fill:'#fff',stroke:'#B3760F',
        'stroke-width':px(2)}); c.style.pointerEvents='none'; });
    }
  }

  /* ---- schnelles Patchen während des Ziehens ---- */
  function patchDrag(){
    if(!dragging) return;
    if(dragging.typ==='vtx'){
      const s=dragging.schiff, P=abs(s.polygon);
      const poly=refs.poly[s.id];
      if(poly) poly.setAttribute('points',P.map(p=>p.join(',')).join(' '));
      const d=(refs.dots[s.id]||[])[dragging.i];
      if(d){ const p=P[dragging.i];
        d.hit.setAttribute('cx',p[0]); d.hit.setAttribute('cy',p[1]);
        d.dot.setAttribute('cx',p[0]); d.dot.setAttribute('cy',p[1]); }
      const l=refs.label[s.id];
      if(l){ const c=polyCenter(P); l.setAttribute('x',c[0]); l.setAttribute('y',c[1]); }
    } else if(dragging.typ==='sekvtx'){
      const k=dragging.sektor, A=abs(k.polygon);
      const sp=refs.sek[k.id];
      if(sp) sp.setAttribute('points',A.map(p=>p.join(',')).join(' '));
      const d=(refs.sekDots[k.id]||[])[dragging.i];
      if(d){ const p=A[dragging.i];
        d.hit.setAttribute('cx',p[0]); d.hit.setAttribute('cy',p[1]);
        d.dot.setAttribute('cx',p[0]); d.dot.setAttribute('cy',p[1]); }
    } else if(dragging.typ==='rohr'){
      const r=dragging.rohr, A=abs(r.punkte);
      const ref=refs.rohr[r.id];
      if(ref){ const pts=A.map(p=>p.join(',')).join(' ');
        ref.halo.setAttribute('points',pts); ref.line.setAttribute('points',pts);
        ref.ends[0].setAttribute('cx',A[0][0]); ref.ends[0].setAttribute('cy',A[0][1]);
        ref.ends[1].setAttribute('cx',A[A.length-1][0]); ref.ends[1].setAttribute('cy',A[A.length-1][1]); }
    }
  }

  /* ---- Zeiger: Ziehen, Pan, Klick ---- */
  let pan=null, suppressClick=false, rafPend=null;
  svg.addEventListener('pointerdown',ev=>{
    if(dragging || ev.button===2) return;
    pan={x:ev.clientX,y:ev.clientY,vx:vb.x,vy:vb.y,moved:false,id:ev.pointerId};
  });
  svg.addEventListener('pointermove',ev=>{
    if(dragging){
      const p=relFrom(ev);
      if(dragging.typ==='vtx') dragging.schiff.polygon[dragging.i]=p;
      else if(dragging.typ==='sekvtx') dragging.sektor.polygon[dragging.i]=p;
      else if(dragging.typ==='rohr') dragging.rohr.punkte[dragging.i]=p;
      Store.mark();
      if(!rafPend) rafPend=requestAnimationFrame(()=>{ rafPend=null; patchDrag(); });
      return;
    }
    if(pan){
      const dx=ev.clientX-pan.x, dy=ev.clientY-pan.y;
      if(!pan.moved && Math.hypot(dx,dy)<5) return;
      if(!pan.moved){ pan.moved=true; try{ svg.setPointerCapture(pan.id); }catch(e){} }
      const r=svg.getBoundingClientRect();
      vb.x=pan.vx-dx*(vb.w/r.width); vb.y=pan.vy-dy*(vb.h/r.height); applyVB();
    }
  });
  const endPointer=ev=>{
    if(dragging){ dragging=null; svg.style.cursor=''; opts.onChange&&opts.onChange(); draw(); }
    if(pan&&pan.moved){ suppressClick=true; setTimeout(()=>suppressClick=false,80);
      try{ svg.releasePointerCapture(pan.id); }catch(e){} }
    pan=null;
  };
  ['pointerup','pointercancel'].forEach(e=>svg.addEventListener(e,endPointer));

  svg.addEventListener('click',ev=>{
    if(suppressClick) return;
    if(modus==='rohr'){
      const p=relFrom(ev);
      drawPts=drawPts||[]; drawPts.push(p);
      if(drawPts.length>=2){ rohrFertig(); return; }
      draw();
    }
  });
  svg.addEventListener('contextmenu',ev=>{
    if(modus==='rohr'&&drawPts&&drawPts.length){
      ev.preventDefault();
      drawPts.push(relFrom(ev)); draw();
      toast('Zwischenpunkt gesetzt – Linksklick beendet das Rohr');
    }
  });
  function rohrFertig(){
    if(drawPts&&drawPts.length>=2) opts.onRohrFertig&&opts.onRohrFertig(drawPts.slice());
    drawPts=null; draw();
  }

  svg.addEventListener('wheel',ev=>{ ev.preventDefault(); zoom(ev.deltaY>0?1.18:1/1.18,ev); },{passive:false});
  function zoom(fac, ev){
    let ax=vb.x+vb.w/2, ay=vb.y+vb.h/2;
    if(ev){ const p=svgPt(ev); ax=p.x; ay=p.y; }
    const nw=clamp(vb.w*fac, W*0.05, W*2), nh=nw*(vb.h/vb.w);
    vb.x=ax-(ax-vb.x)*(nw/vb.w); vb.y=ay-(ay-vb.y)*(nh/vb.h);
    vb.w=nw; vb.h=nh; applyVB(); skala=0; draw();
  }
  const zc=el('div','zoomctl');
  const zb=(t,fn,title)=>{const b=el('button',null,t); b.onclick=fn; if(title)b.title=title; return b;};
  zc.appendChild(zb('+',()=>zoom(1/1.4)));
  zc.appendChild(zb('−',()=>zoom(1.4)));
  zc.appendChild(zb('⤢',()=>{vb={x:0,y:0,w:W,h:H};applyVB();skala=0;draw();},'Ganze Seite'));
  wrap.appendChild(zc);

  draw();
  requestAnimationFrame(()=>{ neuMessen(); requestAnimationFrame(neuMessen); });
  setTimeout(neuMessen, 120); setTimeout(neuMessen, 400);
  if(window.ResizeObserver){ const ro=new ResizeObserver(()=>{ skala=0; neuMessen(); }); ro.observe(wrap); }

  return {
    node:wrap, redraw:draw,
    setModus(m){ modus=m; drawPts=null; draw(); },
    getModus(){ return modus; },
    setSelected(id){ selSchiff=id; draw(); },
    getSelected(){ return selSchiff; },
    getSelectedSektor(){ return selSektor; },
    abbrechen(){ drawPts=null; draw(); },
    hatZeichnung(){ return !!(drawPts&&drawPts.length); }
  };
}

