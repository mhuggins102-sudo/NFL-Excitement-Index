import{createElement as h,useState,useCallback,useEffect,useRef,Fragment}from"https://esm.sh/react@18.2.0";
import{createRoot}from"https://esm.sh/react-dom@18.2.0/client";
import{TEAMS,tn,TK,espnSB,espnSum,parseEv,computeExc,oGrade,gradeFor,extractKP,buildBox,buildStats,buildPlayerStats,buildSummaryData,getAllPlays}from"./engine.js";

const cc=c=>({s:"cs",a:"ca",b:"cb",c:"cc",d:"cd",f:"cf"}[c]||"");
const bc=c=>({s:"bs",a:"ba",b:"bbl",c:"bc",d:"bd",f:"bf2"}[c]||"");

// ── Claude API Summary ──
async function generateSummary(data){
  const prompt=`You are writing a game recap for The Athletic. Your audience is NFL fans who missed the game and want to know what happened. Write the way Nate Taylor, Zach Kram, or Mike Sando would — authoritative, vivid, specific, flowing. Not a box score. Not a template. A story.

HERE IS THE GAME DATA. Use ONLY these facts. Do NOT make up any stats, scores, or events:
${JSON.stringify(data, null, 1)}

STYLE REQUIREMENTS:
- 3-4 paragraphs. Flowing prose. No bullet points, no headers, no labels, no section titles.
- LEDE: One sentence that captures the result AND the story. Not "Team A defeated Team B 30-20." Instead: "Jayden Daniels threw five touchdown passes and Washington's defense forced three turnovers to pull away from Philadelphia 36-33 in a game that wasn't as close as the final score suggests." Lead with what made the game interesting.
- BODY: Walk through the game chronologically. Use the scoringPlays and their runningScore fields to reference specific margins at specific moments ("Washington led 21-3 at halftime", "Philadelphia cut it to 28-26 in the third"). Name players by last name. Cite their exact stats from playerLeaders.
- Describe HOW things happened — was it a 70-yard bomb? A goal-line stand? A pick-six? Use the play descriptions from scoringPlays.
- Reference turnovers, missed kicks, or critical stops from keyNonScoringPlays when they shaped the game.
- Use full team names (Eagles, Commanders, Chiefs) not abbreviations.
- CLOSING: One sentence capturing what the game meant or its character.
- Past tense. No cliches. No "when it was all said and done." No "at the end of the day."
- If the game was a blowout, say so directly. Describe when it was effectively over.

Write the recap now.`;

  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:prompt}]})
    });
    if(!r.ok)return null;
    const d=await r.json();const text=d.content?.[0]?.text;
    if(!text)return null;
    return text.split(/\n\n+/).filter(p=>p.trim().length>0);
  }catch(e){return null}
}

function fallbackSummary(data){
  const pa=[];
  pa.push(`${data.matchup}. Final: ${data.finalScore}. ${data.date}${data.venue?` at ${data.venue}`:""}.`);
  const log=data.scoringPlays||[];
  if(log.length>=4){
    const half=log.filter(s=>s.period==="Q1"||s.period==="Q2");
    const lastHalf=half[half.length-1];
    if(lastHalf)pa.push(`The halftime score was ${lastHalf.runningScore} after ${half.length} first-half scoring drives.`);
  }
  if(data.playerLeaders&&data.playerLeaders.length>0)pa.push(`Key performances: ${data.playerLeaders.slice(0,4).join(". ")}.`);
  pa.push(`Excitement Index: ${data.excitementScore} — ${data.excitementVerdict}.`);
  return pa;
}

// ── App ──
function App(){
  const[t1,sT1]=useState("");const[t2,sT2]=useState("");const[ssn,sSsn]=useState("2024");const[wk,sWk]=useState("");const[st,sSt]=useState("2");
  const[games,sGames]=useState([]);const[ldg,sLdg]=useState(false);const[prog,sProg]=useState({p:0,t:""});
  // FIX #4: date sort direction toggleable: "dateDesc" (new first) or "dateAsc" (old first) or "exc"
  const[sort,sSort]=useState("dateDesc");
  const[det,sDet]=useState(null);const[ldD,sLdD]=useState(false);const[err,sErr]=useState(null);
  const[meth,sMeth]=useState(false);const[cache,sCache]=useState({});const[batching,sBatching]=useState(false);
  const[summary,sSummary]=useState(null);const[sumLoading,sSumLoading]=useState(false);const[selGame,sSelGame]=useState(null);
  const detRef=useRef(null);

  const seasons=[];for(let y=2024;y>=1970;y--)seasons.push(""+y);
  const weeks=[];for(let w=1;w<=18;w++)weeks.push(""+w);

  useEffect(()=>{if(det&&detRef.current)detRef.current.scrollIntoView({behavior:'smooth',block:'start'})},[det]);

  const search=useCallback(async()=>{
    if(!ssn&&!t1){sErr("Select at least a season or team.");return}
    sLdg(true);sGames([]);sDet(null);sSummary(null);sErr(null);sCache({});sProg({p:0,t:"Searching..."});sSelGame(null);
    // FIX #4: default to dateDesc after search
    sSort("dateDesc");
    try{
      const res=[];let seasonsToSearch=ssn?[ssn]:[];
      if(!ssn)for(let y=2024;y>=2015;y--)seasonsToSearch.push(""+y);
      const types=st?[st]:["2","3"];const allBatches=[];
      for(const season of seasonsToSearch){
        if(wk){for(const s of types)allBatches.push({season,w:wk,s})}
        else{for(const s of types){const mx=s==="3"?5:18;for(let w=1;w<=mx;w++)allBatches.push({season,w:""+w,s})}}}
      let done=0;
      for(let i=0;i<allBatches.length;i+=8){
        const batch=allBatches.slice(i,i+8);
        const r=await Promise.all(batch.map(({season,w,s})=>espnSB({dates:season,week:w,seasontype:s,limit:50}).then(ev=>ev.map(parseEv).filter(Boolean)).catch(()=>[])));
        for(const x of r)res.push(...x);done+=batch.length;
        sProg({p:Math.round(done/allBatches.length*100),t:seasonsToSearch.length>1?`Searching ${seasonsToSearch.length} seasons... ${Math.round(done/allBatches.length*100)}%`:`Fetching week ${Math.min(done,allBatches.length)} of ${allBatches.length}...`})}
      let f=res.filter(g=>g&&g.done);
      if(t1)f=f.filter(g=>g.ht===t1||g.at===t1);if(t2)f=f.filter(g=>g.ht===t2||g.at===t2);
      const seen=new Set();f=f.filter(g=>{if(seen.has(g.id))return false;seen.add(g.id);return true});
      sGames(f);
    }catch(e){sErr("Failed to load games.")}
    sLdg(false);sProg({p:100,t:""});
  },[t1,t2,ssn,wk,st]);

  const analyze=useCallback(async g=>{
    sSelGame(g);sLdD(true);sDet(null);sErr(null);sSummary(null);
    try{
      const d=await espnSum(g.id);const exc=computeExc(g,d);const kp=extractKP(d);
      const box=buildBox(d);const stats=buildStats(d);const pStats=buildPlayerStats(d);
      sDet({exc,kp,box,stats,pStats,d});sCache(p=>({...p,[g.id]:exc.total}));sLdD(false);
      sSumLoading(true);
      const sumData=buildSummaryData(g,d,exc);
      const aiSum=await generateSummary(sumData);
      sSummary(aiSum||fallbackSummary(sumData));sSumLoading(false);
    }catch(e){sErr(`Failed to analyze: ${e?.message||e}`);sLdD(false)}
  },[]);

  const batchAn=useCallback(async()=>{
    sBatching(true);const unc=games.filter(g=>!(g.id in cache));let done=0;
    for(let i=0;i<unc.length;i+=4){
      const b=unc.slice(i,i+4);
      const r=await Promise.all(b.map(async g=>{try{const d=await espnSum(g.id);return{id:g.id,sc:computeExc(g,d).total}}catch{return{id:g.id,sc:0}}}));
      const u={};for(const x of r)u[x.id]=x.sc;sCache(p=>({...p,...u}));
      done+=b.length;sProg({p:Math.round(done/unc.length*100),t:`Analyzing ${done} of ${unc.length}...`})}
    sBatching(false);sSort("exc");
  },[games,cache]);

  // FIX #4: Toggle date sort direction
  function toggleDateSort(){
    if(sort==="dateDesc")sSort("dateAsc");else sSort("dateDesc");
  }

  const sorted=[...games].sort((a,b)=>{
    if(sort==="exc"){const sa=cache[a.id]??-1,sb=cache[b.id]??-1;return sb-sa}
    if(sort==="dateAsc")return new Date(a.date)-new Date(b.date);
    return new Date(b.date)-new Date(a.date); // dateDesc default
  });

  return h("div",{className:"app"},
    h("div",{className:"hdr"},h("div",{className:"hdr-tag"},"1970 — Present"),h("h1",null,"NFL Excitement Index"),h("div",{className:"sub"},"Quantifying what makes football unforgettable")),
    !det?h(Fragment,null,
      // FIX #3: Removed "Find Games" label
      h("div",{className:"sp"},
        h("div",{className:"sr"},
          h("div",{className:"fld"},h("label",null,"Team 1"),h("select",{value:t1,onChange:e=>sT1(e.target.value)},h("option",{value:""},"Any Team"),TK.map(k=>h("option",{key:k,value:k},TEAMS[k])))),
          h("div",{className:"fld"},h("label",null,"Team 2"),h("select",{value:t2,onChange:e=>sT2(e.target.value)},h("option",{value:""},"Any Team"),TK.map(k=>h("option",{key:k,value:k},TEAMS[k])))),
          h("div",{className:"fld"},h("label",null,"Season"),h("select",{value:ssn,onChange:e=>sSsn(e.target.value)},h("option",{value:""},"Last 10 Years"),seasons.map(s=>h("option",{key:s,value:s},s)))),
          // FIX #2: Week and Type side by side
          h("div",{className:"fld fld-sm"},h("label",null,"Week"),h("select",{value:wk,onChange:e=>sWk(e.target.value)},h("option",{value:""},"All"),weeks.map(w=>h("option",{key:w,value:w},`Wk ${w}`)))),
          h("div",{className:"fld fld-sm"},h("label",null,"Type"),h("select",{value:st,onChange:e=>sSt(e.target.value)},h("option",{value:"2"},"Regular"),h("option",{value:"3"},"Playoffs"),h("option",{value:""},"Both"))),
          h("button",{className:"btn btn-p",onClick:search,disabled:ldg},ldg?"...":"Search")),
        h("div",{className:"hints"},!ssn&&t1?"Will search 2015-2024. Select a season for faster results.":"Set a team + season to see all their games.")),
      ldg?h("div",{className:"ld"},h("div",{className:"ld-r"}),h("div",{className:"ld-t"},prog.t),prog.p>0&&prog.p<100?h("div",{className:"pw"},h("div",{className:"pb"},h("div",{className:"pf",style:{width:`${prog.p}%`}}))):null):null,
      err&&!det?h("div",{style:{textAlign:"center",padding:"2rem"}},h("div",{style:{color:"var(--red)",fontFamily:"Oswald",fontSize:"1.1rem"}},"Error"),h("div",{style:{color:"var(--text-3)",fontSize:".85rem"}},err)):null,
      games.length>0&&!ldg?h("div",{className:"rl"},
        h("div",{className:"rl-hdr"},
          h("div",{className:"rl-cnt"},`${games.length} game${games.length!==1?"s":""} found`),
          h("div",{className:"sc"},
            // FIX #4: By Date toggles direction, shows arrow
            h("button",{className:`sb${sort.startsWith("date")?" on":""}`,onClick:toggleDateSort},
              sort==="dateAsc"?"Date ↑":"Date ↓"),
            games.every(g=>g.id in cache)?h("button",{className:`sb${sort==="exc"?" on":""}`,onClick:()=>sSort("exc")},"By Excitement"):h("button",{className:"sb",onClick:batchAn,disabled:batching},batching?"Analyzing...":"Rank by Excitement"))),
        batching?h("div",{className:"pw"},h("div",{className:"pb"},h("div",{className:"pf",style:{width:`${prog.p}%`}})),h("div",{className:"pl"},prog.t)):null,
        sorted.map(g=>{const c=cache[g.id];const gr=c!=null?oGrade(c):null;
          const hw=g.hs>g.as;const aw=g.as>g.hs;
          const hiScore=Math.max(g.hs,g.as);const loScore=Math.min(g.hs,g.as);
          // FIX #5: Show date for every game
          const dateStr=new Date(g.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
          return h("div",{key:g.id,className:"gr",onClick:()=>analyze(g)},
            h("div",null,
              h("span",{className:"mu"},
                h("span",{className:aw?"wt":""},g.at),
                h("span",{className:"at"}," @ "),
                h("span",{className:hw?"wt":""},g.ht)),
              c!=null?h("span",{className:`ep ${cc(gr.c)}`,style:{borderColor:`var(--g${gr.c})`}},`${c} — ${gr.g}`):null),
            h("div",{className:"sc2"},`${hiScore}–${loScore}`),
            h("div",{className:"mc"},dateStr,h("br"),g.week?.number?(g.season?.type===3?"Playoffs":`Week ${g.week.number}`):""))})
      ):null
    ):null,
    ldD?h("div",{className:"ld"},h("div",{className:"ld-r"}),h("div",{className:"ld-t"},"Analyzing play-by-play data...")):null,
    det&&selGame?h("div",{ref:detRef},h(Detail,{g:selGame,d:det,summary,sumLoading,meth,sMeth,onBack:()=>{sDet(null);sSelGame(null);sSummary(null)}})):null,
    h("div",{className:"ftr"},"NFL Game Excitement Index · Play-by-play data from ESPN · Summaries powered by Claude"));
}

function Detail({g,d,summary,sumLoading,meth,sMeth,onBack}){
  const{exc,kp,box,stats,pStats}=d;const og=oGrade(exc.total);
  const date=new Date(g.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const tags={td:["TD","t-td"],to:["TURNOVER","t-to"],bg:["BIG PLAY","t-bg"],cl:["CLUTCH","t-cl"],sp:["SPECIAL","t-sp"]};

  const passCols=["C/ATT","YDS","AVG","TD","INT","QBR"];
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
        return h("div",{key:k,className:"gc"},
          h("div",{className:"gi"},h("h3",null,v.name),h("div",{className:"ds"},v.desc),h("div",{className:"dt"},v.detail),h("div",{className:"br"},h("div",{className:`bf ${bc(gr.c)}`,style:{width:`${pct}%`}}))),
          h("div",{className:`gbg ${cc(gr.c)}`},h("div",null,gr.g),h("div",{className:"pt"},`${v.score}/${v.max}`)))}))),

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
