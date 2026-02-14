// Piratwhist Card Gallery – v1.2.5
// Shows all 52 cards using the same renderer as the game (no server needed).

(function(){
  const SUITS = ["♠","♥","♦","♣"];
  const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];

  function el(id){ return document.getElementById(id); }

  function renderCardFace(card){
    const red = (card.suit === "♥" || card.suit === "♦");
    const wrap = document.createElement("div");
    wrap.className = "playingcard" + (red ? " red" : "");

    const c1 = document.createElement("div");
    c1.className = "corner tl";
    c1.innerHTML = `<div class="rk">${card.rank}</div><div class="st">${card.suit}</div>`;

    const c2 = document.createElement("div");
    c2.className = "corner br";
    c2.innerHTML = `<div class="rk">${card.rank}</div><div class="st">${card.suit}</div>`;

    const svg = buildCardSVG(card);
    wrap.appendChild(c1);
    wrap.appendChild(svg);
    wrap.appendChild(c2);
    return wrap;
  }

  // SVG card face (same idea as online.js)
  function buildCardSVG(card){
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 140");
    svg.setAttribute("class", "cardface-svg");

    const suit = card.suit;
    const rank = String(card.rank);

    function pip(x, y, size, rotate){
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-size", String(size));
      t.setAttribute("class", "pip");
      t.textContent = suit;
      if (rotate){
        t.setAttribute("transform", `rotate(${rotate} ${x} ${y})`);
      }
      svg.appendChild(t);
    }

    const isFace = (rank === "J" || rank === "Q" || rank === "K");
    const isAce  = (rank === "A");

    if (isFace){
    // Face cards use the shared CardKit images (K, Q, J).
    const img = document.createElementNS(NS, "image");
    const href = (rank === "K") ? "assets/face_K.png"
               : (rank === "Q") ? "assets/face_D.png"
               : "assets/face_J.png";
    img.setAttribute("href", href);
    img.setAttribute("x", "18");
    img.setAttribute("y", "24");
    img.setAttribute("width", "64");
    img.setAttribute("height", "92");
    img.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.appendChild(img);

    // Small watermark suit
    pip(50, 116, 24, 0);
    return svg;
  }

  if (isAce){
      pip(50, 70, 60, 0);
      return svg;
    }

    // Pips layouts (2–10)
    const layouts = {
      "2":  [[50,34],[50,106]],
      "3":  [[50,32],[50,70],[50,108]],
      "4":  [[35,34],[65,34],[35,106],[65,106]],
      "5":  [[35,34],[65,34],[50,70],[35,106],[65,106]],
      "6":  [[35,32],[65,32],[35,70],[65,70],[35,108],[65,108]],
      "7":  [[35,30],[65,30],[35,60],[65,60],[50,70],[35,110],[65,110]],
      "8":  [[35,28],[65,28],[35,54],[65,54],[35,86],[65,86],[35,112],[65,112]],
      "9":  [[35,28],[65,28],[35,50],[65,50],[50,70],[35,90],[65,90],[35,112],[65,112]],
      "10": [[35,26],[65,26],[35,46],[65,46],[35,66],[65,66],[35,94],[65,94],[35,114],[65,114]],
    };

    const coords = layouts[rank] || [];
    for (const [x,y] of coords){
      pip(x,y,26,0);
    }
    return svg;
  }

  function renderCardBack(){
    const wrap = document.createElement("div");
    wrap.className = "playingcard back";
    return wrap;
  }

  function build(){
    const grid = el("cgGrid");
    const backBox = el("cgBack");

    // One official back sample
    backBox.appendChild(renderCardBack());

    for (const suit of SUITS){
      for (const rank of RANKS){
        const card = { suit, rank };
        const cell = document.createElement("div");
        cell.className = "cgCell";

        const face = renderCardFace(card);
        cell.appendChild(face);

        const label = document.createElement("div");
        label.className = "cgLabel";
        label.textContent = `${rank}${suit}`;
        cell.appendChild(label);

        grid.appendChild(cell);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", build);
})();