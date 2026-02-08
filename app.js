import{createElement as h,useState,useCallback,useEffect,useRef,Fragment}from"https://esm.sh/react@18.2.0";
import{createRoot}from"https://esm.sh/react-dom@18.2.0/client";
import{TEAMS,tn,TK,espnSB,espnSum,parseEv,computeExc,oGrade,gradeFor,extractKP,buildBox,buildStats,buildPlayerStats,buildSummaryData,getAllPlays}from"./engine.js";

const cc=c=>({s:"cs",a:"ca",b:"cb",c:"cc",d:"cd",f:"cf"}[c]||"");
const bc=c=>({s:"bs",a:"ba",b:"bbl",c:"bc",d:"bd",f:"bf2"}[c]||"");

const normTeam=(x)=>x==="LAR"?"LA":x;
// ── Claude API Summary ──
// ── Recap Generator (local, no external API) ──
const _ns=s=>(s||"").toString().replace(/\s+/g," ").trim();

function _joinSentences(parts){
  return parts.filter(Boolean).map(p=>p.replace(/\s+/g," ").trim()).filter(Boolean).join(" ");
}
function _fmtPer(per){
  if(!per) return "";
  return per<=4?`Q${per}`:"OT";
}
function _fmtDelta(d){
  const x=Math.round(Math.abs(d)*100);
  return x?`${x} pts`:"";
}
function _pick(arr,seed){
  if(!arr.length) return "";
  // deterministic "random" pick
  const i=Math.abs(seed)%arr.length;
  return arr[i];
}

function _cleanPlay(s){
  s=_norm(s);
  if(!s) return "";
  // Strip boilerplate after XP / 2pt details to keep recaps readable.
  const cutMarkers=[
    "extra point", "TWO-POINT CONVERSION", "TWO POINT CONVERSION", "two-point conversion", "Penalty", "PENALTY"
  ];
  for(const m of cutMarkers){
    const i=s.toLowerCase().indexOf(m.toLowerCase());
    if(i>0){ s=s.slice(0,i).trim(); break; }
  }
  // Remove trailing punctuation spam
  s=s.replace(/\.+$/,"").trim();
  return s;
}

function _scoreLine(sum){
  // Prefer numeric scores if provided; otherwise fall back to finalScore string.
  if(sum && typeof sum.awayScore==="number" && typeof sum.homeScore==="number"){
    return `${tn(sum.awayTeam)} ${sum.awayScore}, ${tn(sum.homeTeam)} ${sum.homeScore}`;
  }
  return sum?.finalScore||"";
}

function _winnerLoser(sum){
  if(sum && typeof sum.awayScore==="number" && typeof sum.homeScore==="number"){
    const aw=tn(sum.awayTeam), hm=tn(sum.homeTeam);
    if(sum.awayScore>sum.homeScore) return {w:aw,l:hm, wAb:sum.awayTeam, lAb:sum.homeTeam};
    if(sum.homeScore>sum.awayScore) return {w:hm,l:aw, wAb:sum.homeTeam, lAb:sum.awayTeam};
    return {w:hm,l:aw, wAb:sum.homeTeam, lAb:sum.awayTeam, tie:true};
  }
  return {w:sum?.matchup||"", l:""};
}


function buildRecap(sum){
  const wl=_winnerLoser(sum);
  const score=_scoreLine(sum);
  const wp=sum?.wpStats||null;
  const top=(sum?.topLeveragePlays||[]).map(x=>({...x, text:_cleanPlay(x.text)})).filter(x=>x.text);
  const vibe = (()=> {
    const pts = (sum.homeScore||0)+(sum.awayScore||0);
    if(wp && wp.crosses50>=6) return "a true seesaw";
    if(wp && wp.minWp!=null && wp.minWp<0.25 && wl.w===sum.homeTeam) return "a comeback";
    if(pts>=55) return "a shootout";
    if(pts<=27) return "a grinder";
    return "a tense finish";
  })();

  const lead = (()=> {
    const end = score.split(",").slice(-1)[0].trim();
    const base = [
      `${wl.w} beat ${wl.l} ${end} in ${vibe}.`,
      `${wl.w} outlasted ${wl.l} ${end} in ${vibe}.`,
      `${wl.w} edged ${wl.l} ${end} in ${vibe}.`
    ];
    return base[Math.floor(((sum.excitementScore||50)+ (wp?.crosses50||0)*7)%base.length)];
  })();

  const beats = top.slice(0,3).map(tp=>{
    const when = tp.period?`${tp.period>=5?"OT":`Q${tp.period}`} ${tp.clock||""}`:"";
    const d = tp.delta!=null ? Math.abs(tp.delta) : null;
    const emph = d!=null && d>=0.35 ? "the hinge" : (d!=null && d>=0.20 ? "a major swing" : "a key moment");
    return `${when?when+": ":""}${tp.text} — ${emph}.`;
  });

  const texture = (()=> {
    if(!wp) return null;
    const inD = wp.inDoubtPct!=null ? `${Math.round(wp.inDoubtPct)}%` : null;
    const c50 = wp.crosses50!=null ? wp.crosses50 : null;
    const late = wp.lateSumAbsDelta!=null ? wp.lateSumAbsDelta.toFixed(2) : null;
    const parts=[];
    if(inD) parts.push(`It spent about ${inD} of snaps in the 20–80% “in doubt” band.`);
    if(c50!=null) parts.push(`Control crossed the 50/50 line ${c50} times.`);
    if(late) parts.push(`Late leverage (52:00 + OT) totaled ${late} in Σ|ΔWP| terms.`);
    return parts.join(" ");
  })();

  const out=[lead];
  if(beats.length) out.push(beats.join(" "));
  if(texture) out.push(texture);

  return out;
}




function WPChart({series, mode, onModeChange, exc, topLev, label}){
  const [sel,setSel]=useState(null);
  if(!series || series.length<2){
    return h("div",{style:{color:"var(--text-3)",fontFamily:"JetBrains Mono",fontSize:".75rem"}}, "Win probability data unavailable.");
  }

  const maxTraw = Math.max(60, ...series.map(s=>+s.tMin||0));
  const maxT = Math.ceil(maxTraw/5)*5; // nicer ticks
  const W=860, H=190, pad=26;
  const toX = (t)=> pad + (t/maxT)*(W-2*pad);
  const toY = (wp)=> pad + (1-wp)*(H-2*pad);

  // Downsample for performance
  const step = Math.max(1, Math.floor(series.length/450));
  const pts=[];
  for(let i=0;i<series.length;i+=step){
    const s=series[i];
    if(s && s.tMin!=null && s.wp!=null) pts.push([toX(s.tMin), toY(s.wp)]);
  }
  const path = "M " + pts.map(p=>p[0].toFixed(2)+" "+p[1].toFixed(2)).join(" L ");

  const opts=["Leverage","Swings","Chaos","Clutch"];
  const overlays=[];

  // helper to create clickable dot
  const dot=(x,y,fill,payload,r=3)=>h("circle",{cx:x,cy:y,r,fill,style:{cursor:"pointer"},onClick:()=>setSel(payload)});

  if(mode==="Leverage"){
    const lev=(topLev||[]).slice(0,8);
    for(const tp of lev){
      if(tp.tMin==null) continue;
      overlays.push(dot(toX(tp.tMin), toY(tp.wp||0.5), "var(--gold)", {kind:"Leverage", ...tp}));
    }
  }else if(mode==="Swings"){
    for(let i=1;i<series.length;i++){
      const a=series[i-1].wp, b=series[i].wp;
      if(a==null||b==null) continue;
      if((a<0.5 && b>=0.5) || (a>=0.5 && b<0.5)){
        const s=series[i];
        overlays.push(dot(toX(s.tMin), toY(s.wp), "var(--blue)", {kind:"Swing", ...s}, 2.8));
      }
    }
  }else if(mode==="Chaos"){
    for(const s of series){
      if(s.tag==="TO" || s.tag==="SP"){
        overlays.push(dot(toX(s.tMin), toY(s.wp), "var(--red)", {kind:"Chaos", ...s}, 2.8));
      }
    }
  }else if(mode==="Clutch"){
    // Shade final 8 minutes of regulation + all OT
    overlays.push(h("rect",{x:toX(52), y:pad, width:toX(maxT)-toX(52), height:H-2*pad, fill:"rgba(201,162,39,.08)"}));
  }

  // Axis ticks
  const ticks=[];
  for(let t=0;t<=maxT;t+=10){
    ticks.push(h("text",{x:toX(t), y:H-8, textAnchor:"middle", className:"wpt"}, String(t)));
  }
  ticks.push(h("text",{x:W-pad, y:H-8, textAnchor:"end", className:"wpt"}, "min"));

  const tip = sel ? h("div",{className:"mdl"},
    h("div",{className:"mdlc"},
      h("div",{className:"mdlh"},
        h("div",null,"WP Detail"),
        h("button",{className:"x",onClick:()=>setSel(null)},"×")
      ),
      h("div",{className:"mdlb"},
        h("div",{style:{fontFamily:"JetBrains Mono",fontSize:".75rem",color:"var(--text-2)",marginBottom:".5rem"}},
          sel.period?`${sel.period>=5?"OT":`Q${sel.period}`} ${sel.clock||""}`:`t=${(sel.tMin||0).toFixed(1)}m`
        ),
        sel.text ? h("div",{style:{lineHeight:"1.35",marginBottom:".6rem"}}, sel.text) : null,
        h("div",{style:{fontFamily:"JetBrains Mono",fontSize:".75rem",color:"var(--text-3)"}},
          `WP: ${(100*(sel.wp||0)).toFixed(1)}%`,
          sel.delta!=null?`  |  ΔWP: ${(100*sel.delta).toFixed(1)} pts`:""
        ),
        sel.kind? h("div",{style:{marginTop:".6rem",color:"var(--text-3)",fontSize:".85rem"}},
          sel.kind==="Leverage"?"A high-leverage moment: one of the largest WP swings in the game.":
          sel.kind==="Swing"?"A true swing point: the game crossed the 50/50 line here.":
          sel.kind==="Chaos"?"Chaos marker: a turnover or special-teams event that materially shifted WP.":
          ""
        ):null
      )
    )
  ):null;

  return h("div",{className:"sec"},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:"1rem",flexWrap:"wrap"}},
      h("div",{className:"sec-h",style:{borderBottom:"none",marginBottom:"0"}},label||"Win Probability"),
      h("div",{style:{display:"flex",alignItems:"center",gap:".5rem"}},
        h("div",{style:{fontFamily:"JetBrains Mono",fontSize:".65rem",letterSpacing:".08em",textTransform:"uppercase",color:"var(--text-3)"}}, "Overlay"),
        h("select",{value:mode,onChange:e=>onModeChange(e.target.value),style:{background:"var(--bg-3)",border:"1px solid var(--border-1)",color:"var(--text-1)",padding:".35rem .5rem",borderRadius:"10px",fontFamily:"JetBrains Mono",fontSize:".75rem"}},
          opts.map(o=>h("option",{key:o,value:o},o))
        )
      )
    ),
    h("div",{className:"svgw"},
      h("svg",{viewBox:`0 0 ${W} ${H}`,width:"100%",height:"auto"},
        h("rect",{x:0,y:0,width:W,height:H,rx:16,fill:"var(--bg-2)",stroke:"var(--border-1)"}),
        h("line",{x1:pad,y1:toY(.5),x2:W-pad,y2:toY(.5),stroke:"rgba(255,255,255,.12)","strokeDasharray":"4 4"}),
        h("path",{d:path,fill:"none",stroke:"var(--text-1)","strokeWidth":"2"}),
        overlays,
        ticks
      ),
      h("div",{style:{marginTop:".25rem",color:"var(--text-3)",fontFamily:"JetBrains Mono",fontSize:".72rem"}},
        "Tip: click a dot to see the underlying play."
      )
    ),
    tip
  );
}


function Detail({g,d,summary,sumData,sumLoading,meth,sMeth,onBack}){
  const{exc,kp,box,stats,pStats,wp}=d;const og=oGrade(exc.total);
  const date=new Date(g.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const tags={td:["TD","t-td"],to:["TURNOVER","t-to"],bg:["BIG PLAY","t-bg"],cl:["CLUTCH","t-cl"],sp:["SPECIAL","t-sp"]};

  const passCols=["C/ATT","YDS","AVG","TD","INT","QBR"];
  const [wpMode,setWpMode]=useState("Leverage");
  const rushCols=["CAR","YDS","AVG","TD","LONG"];
  const recCols=["REC","YDS","AVG","TD","LONG","TGTS"];

  function pTable(label,players,cols){
    if(!players||players.length===0)return null;
    const useCols=cols.filter(c=>players.some(p=>p[c]!=null&&p[c]!==""));
    return h(Fragment,null,
      h("tr",null,h("td",{className:"pst-cat",colSpan:useCols.length+1},label)),
      h("tr",null,h("th",null,"Player"),...useCols.map(c=>h("th",{key:c},c))),
      players.map((p,i)=>h("tr",{key:i},
        h("td",null,p.name,h("span",{className:"tm-tag"},p.team)),
        ...useCols.map(c=>h("td",{key:c},p[c]||"—")))));
  }

  return h("div",{className:"dv"},
    h("button",{className:"bb",onClick:onBack},"← Back to results"),
    h("div",{className:"hero an"},
      h("div",{className:"hero-ctx"},g.season?.type===3?"Playoff Game":`Week ${g.week?.number||"?"} · ${g.season?.year||""} Season`),
      // FIX #1: Teams on separate lines with "at" on its own line, records shown
      h("div",{className:"hero-tm"},
        h("span",null,tn(g.at)),
        g.ar?h("span",{style:{fontSize:".5em",color:"var(--text-3)",marginLeft:".4em"}},`(${g.ar})`):null),
      h("div",{style:{fontFamily:"Oswald",fontSize:"clamp(.9rem,2vw,1.2rem)",color:"var(--text-4)",letterSpacing:".1em",margin:".15rem 0"}},"at"),
      h("div",{className:"hero-tm"},
        h("span",null,tn(g.ht)),
        g.hr?h("span",{style:{fontSize:".5em",color:"var(--text-3)",marginLeft:".4em"}},`(${g.hr})`):null),
      h("div",{className:"hero-fs"},g.as,h("span",{className:"dash"},"–"),g.hs),
      // FIX #1: Date, stadium, attendance on separate lines
      h("div",{className:"hero-m"},date),
      g.ven?h("div",{className:"hero-m",style:{marginTop:".15rem"}},g.ven):null,
      g.att?h("div",{className:"hero-m",style:{marginTop:".15rem"}},`Attendance: ${g.att.toLocaleString()}`):null,
      h("div",{className:"hero-e"},
        h("div",{className:"hero-el"},"Excitement Index"),
        h("div",{className:`hero-en ${cc(og.c)}`},exc.total),
        h("div",null,h("span",{className:`hero-eg ${cc(og.c)}`,style:{borderColor:`var(--g${og.c})`}},`${og.g} — ${og.l}`)),
        h("div",{className:"hero-eb"},h("div",{className:`hero-ebf ${bc(og.c)}`,style:{width:`${Math.min(exc.total,100)}%`}})))),

    box.length>0?h("div",{className:"sec an a1"},h("div",{className:"sec-h"},"Box Score"),
      h("table",{className:"bt"},
        h("thead",null,h("tr",null,h("th",null,""),
          ...(box[0]?.qs||[]).map((_,i)=>h("th",{key:i},i>=4?`OT${i>4?i-3:""}`:`Q${i+1}`)),
          h("th",null,"Final"))),
        h("tbody",null,box.map((r,i)=>h("tr",{key:i,className:r.win?"win":""},
          h("td",null,r.team),...r.qs.map((q,qi)=>h("td",{key:qi},q)),h("td",{className:"fc"},r.total)))))):null,

    stats.length>0?h("div",{className:"sec an a2"},h("div",{className:"sec-h"},"Team Statistics"),
      h("table",{className:"st"},
        h("thead",null,h("tr",null,h("th",{style:{textAlign:"right",width:"35%"}},box[0]?.team||"Away"),h("th",{style:{textAlign:"center",width:"30%"}},""),h("th",{style:{textAlign:"left",width:"35%"}},box[1]?.team||"Home"))),
        h("tbody",null,stats.map((s,i)=>h("tr",{key:i},h("td",{style:{textAlign:"right"}},s.away),h("td",{className:"sn"},s.label),h("td",{style:{textAlign:"left"}},s.home)))))):null,

    pStats&&(pStats.passing.length>0||pStats.rushing.length>0||pStats.receiving.length>0)?
      h("div",{className:"sec an a3"},h("div",{className:"sec-h"},"Player Statistics"),
        h("table",{className:"pst"},h("tbody",null,
          pTable("Passing",pStats.passing,passCols),
          pTable("Rushing",pStats.rushing,rushCols),
          pTable("Receiving",pStats.receiving,recCols)))):null,

    h("div",{className:"sec an a4"},h("div",{className:"sec-h"},"Excitement Breakdown"),
      h("div",{className:"gg"},Object.entries(exc.scores).map(([k,v])=>{const gr=gradeFor(v.score,v.max);const pct=v.score/v.max*100;
        return h("div",{key:k,className:"gc",role:"button",tabIndex:0,onClick:()=>openCat(k,v),onKeyDown:(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCat(k,v);}}},
          h("div",{className:"gi"},h("h3",null,v.name),h("div",{className:"ds"},v.desc),h("div",{className:"dt"},v.detail),h("div",{className:"br"},h("div",{className:`bf ${bc(gr.c)}`,style:{width:`${pct}%`}}))),
          h("div",{className:`gbg ${cc(gr.c)}`},h("div",null,gr.g),h("div",{className:"pt"},`${v.score}/${v.max}`)))}))),

    h(WPChart,{series:wp?.series||[], mode:wpMode, onModeChange:setWpMode, exc, topLev:(sumData?.topLeveragePlays||[]), label: sumData ? `Win Probability (${tn(sumData.homeTeam)||sumData.homeTeam})` : "Win Probability"}),

    h("div",{className:"sec an a5"},h("div",{className:"sec-h"},"Game Recap"),
      h("div",{className:"wb"},
        sumLoading?h("p",{style:{fontStyle:"italic",color:"var(--text-3)"}},"Generating game recap..."):
        summary?summary.map((p,i)=>h("p",{key:i},p)):
        h("p",{style:{color:"var(--text-3)"}},"Recap unavailable."))),

    kp.length>0?h("div",{className:"sec an a6"},h("div",{className:"sec-h"},"Key Plays"),
      kp.map((p,i)=>{const[lbl,cls]=tags[p.tag]||["",""];
        return h("div",{key:i,className:"pi"},
          h("div",{className:"pt2"},`${p.period>=5?"OT":`Q${p.period}`} ${p.clock}`),
          h("div",{className:"ptx"},h("span",{className:`ptg ${cls}`},lbl),p.text))})):null,

    h("div",{className:"sec an a7"},
      h("button",{className:"mt",onClick:()=>sMeth(!meth)},meth?"▾":"▸"," Scoring Methodology"),
      meth?h("div",{className:"mb"},
        h("h4",null,"Competitiveness (0–20)"),"Measures what percentage of the game was played within one score (8 pts). Bonus for games within 3 pts. Penalized for high average margin.",
        h("h4",null,"Comeback Factor (0–15)"),"Winner's max deficit overcome + loser's best non-garbage-time swing + lead reversals. Garbage-time scoring excluded.",
        h("h4",null,"Late-Game Drama (0–15)"),"Only counts Q4 events when the game is within 2 scores AT THE TIME of the event. Scoring from 55-0 to 55-7 earns nothing. Includes clutch scores, near-misses, and OT.",
        h("h4",null,"Big Plays (0–15)"),"40+ yd gains and 25+ yd TDs on offensive/return plays. Field goals excluded. Weighted by game context: big plays in close games score higher. Penalty-nullified plays excluded.",
        h("h4",null,"Game Stakes (0–10)"),"Super Bowl/Conf Championship (10) down to early season (2). Boosted when both teams have winning records and for late-season division games.",
        h("h4",null,"Rivalry Factor (0–10)"),"Historical rivalry base + same division/conference + both teams' current quality.",
        h("h4",null,"Scoring Volume (0–10)"),"Total combined points. Bonus when both teams score 20+.",
        h("h4",null,"Turnovers & Momentum (0–15)"),"INTs, fumbles, defensive/ST TDs, blocked kicks, turnovers on downs, missed FGs, safeties.",
        h("h4",null,"Lead Changes (0–10)"),"Minute-by-minute tracking of lead swaps and ties (0-0 start excluded).",
        h("h4",null,"Overtime (0–5)"),"Bonus for OT, extra for multiple OT periods."
      ):null));
}

createRoot(document.getElementById("app")).render(h(App));