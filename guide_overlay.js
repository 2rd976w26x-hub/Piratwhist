// Piratwhist Guide Overlay (v0.2.96)
// Lightweight SVG overlay for arrows + labels. Used in guide mode only.
(function(){
  function ensureLayer(){
    let wrap = document.getElementById('pwGuideOverlay');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'pwGuideOverlay';
    wrap.style.position = 'fixed';
    wrap.style.inset = '0';
    wrap.style.zIndex = '999999';
    wrap.style.pointerEvents = 'none';
    document.body.appendChild(wrap);

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width','100%');
    svg.setAttribute('height','100%');
    svg.setAttribute('viewBox',`0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.id = 'pwGuideSvg';

    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg','marker');
    marker.setAttribute('id','pwGuideArrow');
    marker.setAttribute('viewBox','0 0 10 10');
    marker.setAttribute('refX','8');
    marker.setAttribute('refY','5');
    marker.setAttribute('markerWidth','7');
    marker.setAttribute('markerHeight','7');
    marker.setAttribute('orient','auto-start-reverse');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill','rgba(255,255,255,0.95)');
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    wrap.appendChild(svg);

    function resize(){
      svg.setAttribute('viewBox',`0 0 ${window.innerWidth} ${window.innerHeight}`);
    }
    window.addEventListener('resize', ()=>{ resize(); });
    return wrap;
  }

  function rectOf(elOrSel){
    const el = (typeof elOrSel === 'string') ? document.querySelector(elOrSel) : elOrSel;
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  function center(r){ return {x: r.left + r.width/2, y: r.top + r.height/2}; }

  function clear(){
    const svg = document.getElementById('pwGuideSvg');
    if (!svg) return;
    [...svg.querySelectorAll('.pwGuideItem')].forEach(n=>n.remove());
  }

  function addArrow(fromSel, toSel, label){
    const layer = ensureLayer();
    const svg = layer.querySelector('#pwGuideSvg');
    const r1 = rectOf(fromSel);
    const r2 = rectOf(toSel);
    if (!r1 || !r2 || !svg) return;
    const p1 = center(r1);
    const p2 = center(r2);

    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.classList.add('pwGuideItem');
    line.setAttribute('x1', String(p1.x));
    line.setAttribute('y1', String(p1.y));
    line.setAttribute('x2', String(p2.x));
    line.setAttribute('y2', String(p2.y));
    line.setAttribute('stroke','rgba(255,255,255,0.95)');
    line.setAttribute('stroke-width','3');
    line.setAttribute('marker-end','url(#pwGuideArrow)');
    svg.appendChild(line);

    if (label){
      const tx = (p1.x + p2.x) / 2;
      const ty = (p1.y + p2.y) / 2;
      const t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.classList.add('pwGuideItem');
      t.setAttribute('x', String(tx));
      t.setAttribute('y', String(ty - 10));
      t.setAttribute('text-anchor','middle');
      t.setAttribute('font-size','16');
      t.setAttribute('font-weight','700');
      t.setAttribute('fill','rgba(0,0,0,0.9)');
      t.setAttribute('stroke','rgba(255,255,255,0.95)');
      t.setAttribute('stroke-width','4');
      t.setAttribute('paint-order','stroke');
      t.textContent = label;
      svg.appendChild(t);
    }
  }

  function addBox(targetSel, label){
    const layer = ensureLayer();
    const svg = layer.querySelector('#pwGuideSvg');
    const r = rectOf(targetSel);
    if (!r || !svg) return;

    const box = document.createElementNS('http://www.w3.org/2000/svg','rect');
    box.classList.add('pwGuideItem');
    box.setAttribute('x', String(r.left));
    box.setAttribute('y', String(r.top));
    box.setAttribute('width', String(r.width));
    box.setAttribute('height', String(r.height));
    box.setAttribute('rx','14');
    box.setAttribute('ry','14');
    box.setAttribute('fill','rgba(0,0,0,0.0)');
    box.setAttribute('stroke','rgba(0,255,200,0.85)');
    box.setAttribute('stroke-width','3');
    svg.appendChild(box);

    if (label){
      const t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.classList.add('pwGuideItem');
      t.setAttribute('x', String(r.left + 8));
      t.setAttribute('y', String(r.top - 8));
      t.setAttribute('font-size','16');
      t.setAttribute('font-weight','800');
      t.setAttribute('fill','rgba(0,0,0,0.9)');
      t.setAttribute('stroke','rgba(0,255,200,0.95)');
      t.setAttribute('stroke-width','4');
      t.setAttribute('paint-order','stroke');
      t.textContent = label;
      svg.appendChild(t);
    }
  }

  function addCallout(x, y, text){
    const layer = ensureLayer();
    const svg = layer.querySelector('#pwGuideSvg');
    if (!svg) return;

    // Background box sized based on text length (simple heuristic).
    const lines = String(text || '').split('\n');
    const maxLen = Math.max(1, ...lines.map(l=>l.length));
    const w = Math.min(420, Math.max(220, maxLen * 8 + 28));
    const h = Math.max(44, lines.length * 20 + 18);

    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.classList.add('pwGuideItem');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx','14');
    rect.setAttribute('ry','14');
    rect.setAttribute('fill','rgba(255,255,255,0.92)');
    rect.setAttribute('stroke','rgba(0,0,0,0.12)');
    rect.setAttribute('stroke-width','1');
    svg.appendChild(rect);

    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.classList.add('pwGuideItem');
    t.setAttribute('x', String(x + 14));
    t.setAttribute('y', String(y + 22));
    t.setAttribute('font-size','15');
    t.setAttribute('font-weight','700');
    t.setAttribute('fill','rgba(0,0,0,0.92)');
    lines.forEach((line, i)=>{
      const sp = document.createElementNS('http://www.w3.org/2000/svg','tspan');
      sp.setAttribute('x', String(x + 14));
      sp.setAttribute('dy', i===0 ? '0' : '20');
      sp.textContent = line;
      t.appendChild(sp);
    });
    svg.appendChild(t);
  }

  // Scene-specific overlays
  window.PW_GUIDE_OVERLAYS = {
    onecard(){
      clear();
      addCallout(14, 14, '1-korts runde (bud)\nDu ser IKKE dit eget kort\nDu ser ALLE modstanderes kort');
      addBox('#olHands', 'Dit kort er skjult');
      addBox('#olOppCards', 'Modstandernes kort (synlige)');
      addArrow('#olOppCards', '#olBidSelect', 'Vælg bud');
      addArrow('#olBidSelect', '#olBidSubmit', 'Afgiv bud');
    },
    normal_bidding(){
      clear();
      addCallout(14, 14, 'Normal runde (bud)\nDu ser kun dine egne kort');
      addBox('#olHands', 'Din hånd (synlig)');
      addArrow('#olHands', '#olBidSelect', 'Vælg bud');
      addArrow('#olBidSelect', '#olBidSubmit', 'Afgiv bud');
    },
    trumpwin(){
      clear();
      addCallout(14, 14, 'Stik og trumf\nSpar (♠) er altid trumf\nMan skal bekende kulør hvis muligt');
      addBox('#olPile', 'Kort på bordet (stik)');
      addArrow('#olPile', '.seat[data-seat="2"]', 'Vinder (trumf ♠)');
    },
    clockwise(){
      clear();
      addBox('#olPile', 'Bord');
      addCallout(14, 14, 'Tur-rækkefølge\nAltid med uret (clockwise)');
      // Cue arrows (simple, deterministic)
      addArrow('.seat[data-seat="0"]', '.seat[data-seat="1"]', 'Med uret');
      addArrow('.seat[data-seat="1"]', '.seat[data-seat="2"]', '');
      addArrow('.seat[data-seat="2"]', '.seat[data-seat="3"]', '');
    },
    scoretable(){
      clear();
      addCallout(14, 14, 'Pointoversigt\nTOTAL øverst (kun point)\nSeneste runde øverst\nFormat: Bud / Stik (Point)');
      addBox('#olHistoryTable', 'Samlet oversigt');
      // Highlight TOTAL row + newest round row (if present)
      addBox('#olHistoryTable tbody tr:nth-child(1)', 'TOTAL');
      addBox('#olHistoryTable tbody tr:nth-child(2)', 'Seneste runde');
    }
  };
})();
