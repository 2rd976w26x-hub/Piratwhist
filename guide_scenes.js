// Piratwhist Guide Scenes (v0.2.108)
// Deterministic demo states for rules illustrations. Used when ?guide=1&scene=...
(function(){
  const C = (suit, rank)=>({suit, rank});
  const names4 = ["Du (Spiller 1)","Spiller 2","Spiller 3","Spiller 4"];
  const base = {
    // Fields used by online.js renderer
    phase: "bidding",
    nPlayers: 4,
    dealer: 0,
    leader: 0,
    trump: "♠",
    trick: [],
    trickWinner: null,
    bids: [null,null,null,null],
    tricksTaken: [0,0,0,0],
    names: names4,
    cardsPer: 5,
    round: 1,
    rounds: 10,
    // Score history: array of rounds; each round has cardsPer + bids + tricks + points
    scoreHistory: [],
  };

  // Helper to build score history rows.
  function row(r, cardsPer, bids, tricks, points){
    return { round: r, cardsPer, bids, tricks, points };
  }

  // A compact fake history that matches the current table renderer.
  const hist = [
    row(1, 5, [2,1,0,2], [2,0,0,3], [10,-1,10,-1]),
    row(2, 4, [1,1,1,1], [1,1,0,2], [10,10,-1,-1]),
  ];

  const scenes = {
    // Bidding: normal multi-card round (your hand visible, opponents hidden)
    normal_bidding: {
      ...base,
      phase: "bidding",
      cardsPer: 5,
      round: 3,
      bids: [null, 1, null, null],
      tricksTaken: [0,0,0,0],
      // online.js expects hands as array per seat; local seat 0 uses cards; opponents can be null/[] depending on phase
      hands: [
        [C("♠","A"),C("♥","K"),C("♦","10"),C("♣","7"),C("♠","4")],
        null, null, null
      ],
      scoreHistory: hist,
    },

    // Bidding: 1-card round special rule (you see others, not yourself)
    onecard: {
      ...base,
      phase: "bidding",
      cardsPer: 1,
      round: 5,
      bids: [null,null,null,null],
      tricksTaken: [0,0,0,0],
      hands: [
        null, // your card hidden
        [C("♣","Q")],
        [C("♦","2")],
        [C("♠","9")],
      ],
      scoreHistory: hist,
    },

    // Playing: show a trick where trump wins
    trumpwin: {
      ...base,
      phase: "playing",
      cardsPer: 5,
      round: 6,
      leader: 0,
      trick: [
        { seat: 0, card: C("♥","10") },
        { seat: 1, card: C("♥","K") },
        { seat: 2, card: C("♠","3") }, // trump
        { seat: 3, card: C("♥","A") },
      ],
      trickWinner: 2,
      hands: [
        [C("♣","A"),C("♣","9"),C("♦","J"),C("♠","4")],
        [C("♥","2"),C("♦","8"),C("♣","3"),C("♠","7")],
        [C("♠","Q"),C("♦","6"),C("♣","5"),C("♠","2")],
        [C("♦","A"),C("♦","9"),C("♣","8"),C("♠","5")],
      ],
      bids: [2,1,1,1],
      tricksTaken: [1,0,1,0],
      scoreHistory: hist,
    },

    // Playing: clockwise order illustration (empty trick, just layout)
    clockwise: {
      ...base,
      phase: "playing",
      cardsPer: 5,
      round: 7,
      leader: 0,
      trick: [],
      hands: [
        [C("♠","A"),C("♥","K"),C("♦","10"),C("♣","7"),C("♠","4")],
        null,null,null
      ],
      scoreHistory: hist,
    },

    // Score table illustration (no need for full play)
    scoretable: {
      ...base,
      phase: "bidding",
      cardsPer: 5,
      round: 8,
      hands: [
        [C("♠","A")], null,null,null
      ],
      // Provide more rows so reverse sort is meaningful
      scoreHistory: [
        row(1,5,[2,1,0,2],[2,0,0,3],[10,-1,10,-1]),
        row(2,4,[1,1,1,1],[1,1,0,2],[10,10,-1,-1]),
        row(3,3,[1,0,1,1],[1,0,0,2],[10,10,-1,-1]),
        row(4,2,[1,1,0,0],[0,1,0,1],[-1,10,10,-1]),
      ],
    },
  };

  window.PW_GUIDE_SCENES = scenes;
})();
