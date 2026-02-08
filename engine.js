// engine.js — NFL Excitement Scoring Engine v7
// Comp 0-20, Comeback 0-15, Drama 0-15, BigPlays 0-15,
// Stakes 0-10, Rivalry 0-10, Volume 0-10, Momentum 0-15, Leads 0-10, OT 0-5

export const TEAMS={ARI:"Arizona Cardinals",ATL:"Atlanta Falcons",BAL:"Baltimore Ravens",BUF:"Buffalo Bills",CAR:"Carolina Panthers",CHI:"Chicago Bears",CIN:"Cincinnati Bengals",CLE:"Cleveland Browns",DAL:"Dallas Cowboys",DEN:"Denver Broncos",DET:"Detroit Lions",GB:"Green Bay Packers",HOU:"Houston Texans",IND:"Indianapolis Colts",JAX:"Jacksonville Jaguars",KC:"Kansas City Chiefs",LAC:"Los Angeles Chargers",LAR:"Los Angeles Rams",LV:"Las Vegas Raiders",MIA:"Miami Dolphins",MIN:"Minnesota Vikings",NE:"New England Patriots",NO:"New Orleans Saints",NYG:"New York Giants",NYJ:"New York Jets",PHI:"Philadelphia Eagles",PIT:"Pittsburgh Steelers",SEA:"Seattle Seahawks",SF:"San Francisco 49ers",TB:"Tampa Bay Buccaneers",TEN:"Tennessee Titans",WAS:"Washington Commanders"};
export const tn=a=>TEAMS[a]||a;
export const TK=Object.keys(TEAMS).sort((a,b)=>TEAMS[a].localeCompare(TEAMS[b]));

const CONF={AFC:["BUF","MIA","NE","NYJ","BAL","CIN","CLE","PIT","HOU","IND","JAX","TEN","DEN","KC","LAC","LV"],NFC:["DAL","NYG","PHI","WAS","CHI","DET","GB","MIN","ATL","CAR","NO","TB","ARI","LAR","SEA","SF"]};
const sameConf=(a,b)=>CONF.AFC.includes(a)&&CONF.AFC.includes(b)||CONF.NFC.includes(a)&&CONF.NFC.includes(b);
const DIV={AE:["BUF","MIA","NE","NYJ"],AN:["BAL","CIN","CLE","PIT"],AS:["HOU","IND","JAX","TEN"],AW:["DEN","KC","LAC","LV"],NE2:["DAL","NYG","PHI","WAS"],NN:["CHI","DET","GB","MIN"],NS:["ATL","CAR","NO","TB"],NW:["ARI","LAR","SEA","SF"]};
export const divRivals=(a,b)=>Object.values(DIV).some(d=>d.includes(a)&&d.includes(b));
const RIV={"CHI-GB":10,"DAL-WAS":9,"DAL-PHI":9,"PIT-BAL":9,"PIT-CLE":8,"PHI-NYG":8,"SF-DAL":8,"SF-LAR":8,"ATL-NO":8,"KC-LV":8,"DEN-LV":8,"DAL-NYG":8,"NYG-WAS":7,"PHI-WAS":7,"NE-NYJ":7,"NE-MIA":7,"KC-DEN":7,"BUF-MIA":7,"LAC-LV":7,"GB-MIN":7,"SF-SEA":7,"BAL-CIN":7,"BAL-CLE":7,"PIT-CIN":7,"MIN-CHI":6,"CHI-DET":6,"SEA-LAR":6,"LAC-DEN":6,"ATL-TB":6,"NO-TB":6,"IND-TEN":6,"HOU-TEN":6,"NE-BUF":6,"NE-IND":6,"KC-BUF":5};
const rivBase=(a,b)=>RIV[`${a}-${b}`]||RIV[`${b}-${a}`]||0;

const E="/api/espn";

async function _fetchJson(url, tries=2){
  let lastErr=null;
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(url,{cache:"no-store"});
      const ct=(r.headers.get("content-type")||"").toLowerCase();
      const txt= await r.text();
      if(!r.ok){
        const msg = txt && txt.length<400 ? txt : `HTTP ${r.status}`;
        throw new Error(`Fetch failed: ${r.status} ${r.statusText} — ${msg}`);
      }
      if(ct.includes("application/json")) return JSON.parse(txt||"{}");
      // Some edge cases return JSON without content-type
      try{ return JSON.parse(txt||"{}"); }catch(e){
        throw new Error("Non-JSON response from /api/espn (check Functions deployment).");
      }
    }catch(e){
      lastErr=e;
    }
  }
  throw lastErr||new Error("Fetch failed.");
}

export const espnSB=async p=>{const r=await fetch(`${E}/scoreboard?${new URLSearchParams(p)}`);if(!r.ok)throw 0;return(await r.json()).events||[]};
export const espnSum=async id=>_fetchJson(`${E}/summary?event=${id}`,2);
export const parseEv=ev=>{const c=ev.competitions?.[0];if(!c)return null;const hm=c.competitors?.find(x=>x.homeAway==="home"),aw=c.competitors?.find(x=>x.homeAway==="away");return{id:ev.id,date:ev.date,season:ev.season,week:ev.week,ht:hm?.team?.abbreviation||"???",at:aw?.team?.abbreviation||"???",hs:parseInt(hm?.score)||0,as:parseInt(aw?.score)||0,hr:hm?.records?.[0]?.summary||"",ar:aw?.records?.[0]?.summary||"",ven:c.venue?.fullName||"",att:c.attendance,done:c.status?.type?.completed}};

export function getAllPlays(d){const dr=d?.drives?.previous||[];const p=[];for(const x of dr)for(const y of(x.plays||[]))p.push(y);return p}
function clkSec(t){if(!t)return null;const p=t.split(":");return p.length===2?parseInt(p[0])*60+parseInt(p[1]):null}
function gameElapsed(period,clockText){if(!period)return 0;const left=clkSec(clockText);if(left===null)return(period-1)*900;return(period-1)*900+(900-left)}
function parseRec(r){if(!r)return null;const m=r.match(/(\d+)-(\d+)/);return m?{w:+m[1],l:+m[2]}:null}
function getHomeTeamId(d){const c=d?.header?.competitions?.[0]?.competitors||[];const h=c.find(x=>x.homeAway==="home");return h?.team?.id||null}

function buildMinuteState(d,totalPeriods){
  const sp=d?.scoringPlays||[];const homeId=getHomeTeamId(d);
  const events=[{elapsed:0,hS:0,aS:0,margin:0}];
  for(const s of sp){
    const per=s.period?.number||1;const el=gameElapsed(per,s.clock?.displayValue);
    const hS=s.homeScore!=null?s.homeScore:(s.team?.id===homeId?(events[events.length-1].hS+(s.scoreValue||0)):events[events.length-1].hS);
    const aS=s.awayScore!=null?s.awayScore:(s.team?.id!==homeId?(events[events.length-1].aS+(s.scoreValue||0)):events[events.length-1].aS);
    events.push({elapsed:el,hS,aS,margin:hS-aS});
  }
  const totalMin=totalPeriods*15;const state=[];let ei=0;let curH=0,curA=0;
  for(let m=0;m<=totalMin;m++){const sec=m*60;while(ei<events.length&&events[ei].elapsed<=sec){curH=events[ei].hS;curA=events[ei].aS;ei++}state.push({minute:m,hS:curH,aS:curA,margin:curH-curA})}
  return{state,events};
}

function isGarbageTime(absMargin,min,total){const left=total-min;if(absMargin>=25&&left<=15)return true;if(absMargin>=21&&left<=10)return true;if(absMargin>=17&&left<=5)return true;return false}

// ═══════ MAIN ═══════
export function computeExc(g,d){
  const s={};const plays=getAllPlays(d);const sp=d?.scoringPlays||[];
  const hdr=d?.header?.competitions?.[0];const totalPeriods=(hdr?.competitors?.[0]?.linescores?.length)||4;
  const totalMin=totalPeriods*15;const homeId=getHomeTeamId(d);
  const{state:ms,events:se}=buildMinuteState(d,totalPeriods);
  s.comp=calcComp(ms,totalMin);
  s.comeback=calcComeback(ms,se,totalMin);
  s.drama=calcDrama(ms,sp,plays,homeId,totalMin);
  s.bigPlays=calcBigPlays(plays,ms,totalMin);
  s.stakes=calcStakes(g);
  s.rivalry=calcRivalry(g,d);
  s.volume=calcVolume(g);
  s.momentum=calcMomentum(plays);
  s.leads=calcLeads(ms);
  s.ot=calcOT(totalPeriods);
  const total=Object.values(s).reduce((a,b)=>a+b.score,0);
  return{scores:s,total};
}

// 1. COMPETITIVENESS 0-20
function calcComp(ms,totalMin){
  let w8=0,w3=0,mSum=0;const n=ms.length||1;
  for(const m of ms){const a=Math.abs(m.margin);mSum+=a;if(a<=8)w8++;if(a<=3)w3++}
  const avg=mSum/n;const p8=w8/n;const p3=w3/n;
  let score;
  if(p8>=.95)score=20;else if(p8>=.9)score=19;else if(p8>=.85)score=18;
  else if(p8>=.8)score=17;else if(p8>=.7)score=15;else if(p8>=.6)score=13;
  else if(p8>=.5)score=11;else if(p8>=.4)score=9;else if(p8>=.3)score=6;
  else if(p8>=.2)score=4;else if(p8>=.1)score=2;else score=1;
  if(p3>=.5)score=Math.min(score+2,20);else if(p3>=.3)score=Math.min(score+1,20);
  if(avg>=22)score=Math.max(score-4,1);else if(avg>=16)score=Math.max(score-2,1);
  return{score,max:20,name:"Competitiveness",desc:"% of game played within one score",detail:`Within 1 score: ${Math.round(p8*100)}% of game (avg margin ${avg.toFixed(1)})`};
}

// 2. COMEBACK 0-15
function calcComeback(ms,se,totalMin){
  let maxHD=0,maxAD=0;
  for(const m of ms){if(m.margin<0)maxHD=Math.max(maxHD,-m.margin);if(m.margin>0)maxAD=Math.max(maxAD,m.margin)}
  const final=ms[ms.length-1];const hw=final.margin>0;const wDef=hw?maxHD:maxAD;
  let wS=0;
  if(wDef>=28)wS=13;else if(wDef>=21)wS=11;else if(wDef>=17)wS=9;else if(wDef>=14)wS=7;
  else if(wDef>=10)wS=5;else if(wDef>=7)wS=3;else if(wDef>=4)wS=1;
  let lPeak=0,lSwing=0;
  for(const m of ms){const ld=hw?-m.margin:m.margin;if(ld>0){lPeak=Math.max(lPeak,ld)}
    if(ld>0&&ld<lPeak&&!isGarbageTime(lPeak,m.minute,totalMin))lSwing=Math.max(lSwing,lPeak-ld)}
  let lS=0;if(lSwing>=14)lS=4;else if(lSwing>=10)lS=3;else if(lSwing>=7)lS=2;else if(lSwing>=4)lS=1;
  let rev=0;for(let i=1;i<ms.length;i++){const p=ms[i-1].margin,c=ms[i].margin;if((p<0&&c>0)||(p>0&&c<0))if(!isGarbageTime(Math.abs(c),ms[i].minute,totalMin))rev++}
  let score=Math.min(wS+lS+Math.min(rev,2),15);if(score===0)score=1;
  let det=wDef>=10?`Winner overcame ${wDef}-pt deficit`:lSwing>=7?`Loser cut ${lPeak}-pt lead by ${lSwing}`:rev>=2?`${rev} lead reversals`:`Max deficit overcome: ${wDef} pts`;
  return{score,max:15,name:"Comeback Factor",desc:"Deficits overcome, swings (excl. garbage time)",detail:det};
}

// 3. LATE-GAME DRAMA 0-15
// FIX #10: Q4 scores only count if margin was competitive at the TIME of the score
function calcDrama(ms,sp,plays,homeId,totalMin){
  const q4Idx=Math.min(45,ms.length-1);const q4M=Math.abs(ms[q4Idx]?.margin||0);
  // If blowout entering Q4, minimal drama possible
  if(q4M>24){let ot=0;for(const s of sp)if((s.period?.number||0)>=5)ot++;
    return{score:Math.min(ot*3,15)||1,max:15,name:"Late-Game Drama",desc:"Blowout entering Q4",detail:`${q4M}-pt margin entering Q4`}}
  let q4Close=0,clutch=0,ot=0;
  for(const s of sp){const per=s.period?.number||0;if(per<4)continue;
    const el=gameElapsed(per,s.clock?.displayValue);const min=Math.min(Math.floor(el/60),ms.length-1);
    const margAtTime=Math.abs(ms[min]?.margin||0);
    if(per===4){
      // FIX: Only count Q4 score as drama if margin was within 2 scores at the time
      if(margAtTime<=16){
        q4Close++;
        const sl=clkSec(s.clock?.displayValue);
        if(sl!==null&&sl<=120&&margAtTime<=10)clutch++;
      }
      // If margin was >16, this is garbage time scoring — don't count
    }
    if(per>=5)ot++;
  }
  // Near-misses in Q4 (only if close game)
  let nm=0;
  for(const p of plays){const per=p.period?.number||0;if(per<4)continue;
    const el=gameElapsed(per,p.clock?.displayValue);const min=Math.min(Math.floor(el/60),ms.length-1);
    const margAtTime=Math.abs(ms[min]?.margin||0);
    if(margAtTime>16)continue; // not dramatic if blowout
    const tx=(p.text||"").toLowerCase();const ty=(p.type?.text||"").toLowerCase();const sl=clkSec(p.clock?.displayValue);
    if(ty.includes("turnover on downs"))nm++;
    if(ty.includes("missed field goal")||(tx.includes("field goal")&&(tx.includes("no good")||tx.includes("missed")||tx.includes("wide"))))nm++;
    if(tx.includes("intercept")&&sl!==null&&sl<=300)nm++;
    if(tx.includes("blocked")&&(tx.includes("punt")||tx.includes("field goal")))nm++;
  }
  let score=clutch*4+q4Close*2+ot*3+nm*2;
  if(q4M<=8)score+=3;else if(q4M<=16)score+=1;
  score=Math.min(Math.round(score),15);if(score===0)score=1;
  const parts=[];if(q4M<=8)parts.push("tight entering Q4");if(clutch)parts.push(`${clutch} clutch scores`);
  if(q4Close)parts.push(`${q4Close} competitive Q4 scores`);if(nm)parts.push(`${nm} near-miss${nm>1?"es":""}`);if(ot)parts.push(`${ot} OT scores`);
  return{score,max:15,name:"Late-Game Drama",desc:"Q4 drama only when game is competitive",detail:parts.join(", ")||"Quiet finish"};
}

// 4. BIG PLAYS 0-15
// FIX #7: Field goals are NOT big plays. Only rushes, passes, returns.
// FIX #11: Only count actual TDs — must have "touchdown" in text AND be a scoringPlay,
// AND must be an offensive/return play (not a FG, PAT, safety, etc.)
function calcBigPlays(plays,ms,totalMin){
  let count=0,longest=0,bigTDs=0,contextBonus=0;
  for(const p of plays){
    const y=p.statYardage||0;const tx=(p.text||"").toLowerCase();const ty=(p.type?.text||"").toLowerCase();
    // Skip penalty-nullified plays
    if(tx.includes("penalty")&&(tx.includes("nullif")||tx.includes("no play")))continue;
    if(ty.includes("penalty"))continue;
    // Skip field goals, PATs, kickoffs, punts — these are not "big plays"
    if(ty.includes("field goal")||ty.includes("extra point")||ty.includes("two-point"))continue;
    if(ty.includes("kickoff")||ty.includes("punt")&&!tx.includes("return"))continue;
    // A big play is a 40+ yard gain, or a 25+ yard TD pass/rush/return
    const isActualTD=p.scoringPlay&&tx.includes("touchdown");
    const isBig=y>=40||(y>=25&&isActualTD);
    if(!isBig)continue;
    count++;longest=Math.max(longest,y);
    if(isActualTD)bigTDs++;
    // Context weighting
    const per=p.period?.number||0;const el=gameElapsed(per,p.clock?.displayValue);
    const min=Math.min(Math.floor(el/60),ms.length-1);
    const marg=Math.abs(ms[min]?.margin||0);
    if(marg<=10)contextBonus+=2;else if(marg<=16)contextBonus+=1;
    if(per>=4&&marg<=10)contextBonus+=1;
  }
  let score=count*2+bigTDs+(longest>=80?3:longest>=60?2:longest>=40?1:0)+Math.min(contextBonus,5);
  score=Math.min(score,15);
  let detail=`${count} big play${count!==1?"s":""}`;
  if(bigTDs>0)detail+=`, ${bigTDs} big TD${bigTDs!==1?"s":""}`;
  if(longest>0)detail+=`, longest ${longest} yds`;
  return{score,max:15,name:"Big Plays",desc:"40+ yd gains, 25+ yd TDs (excl. FGs/PATs/penalties)",detail};
}

// 5. STAKES 0-10
function calcStakes(g){
  const wk=g.week?.number;const st=g.season?.type;
  if(st===3){
    if(wk===5||wk===4)return{score:10,max:10,name:"Game Stakes",desc:"Playoff importance, seeding implications",detail:"Super Bowl / Conference Championship"};
    if(wk===3)return{score:9,max:10,name:"Game Stakes",desc:"Playoff importance, seeding implications",detail:"Divisional Round"};
    return{score:8,max:10,name:"Game Stakes",desc:"Playoff importance, seeding implications",detail:"Wild Card Round"};
  }
  const hr=parseRec(g.hr),ar=parseRec(g.ar);
  let base=2;
  if(wk>=17)base=6;else if(wk>=15)base=5;else if(wk>=12)base=4;else if(wk>=8)base=3;
  if(hr&&ar){const hPct=hr.w/(hr.w+hr.l||1);const aPct=ar.w/(ar.w+ar.l||1);
    if(hPct>=.6&&aPct>=.6)base=Math.min(base+2,10);else if(hPct>=.5&&aPct>=.5)base=Math.min(base+1,10)}
  if(divRivals(g.ht,g.at)&&wk>=12)base=Math.min(base+1,10);
  let detail=wk>=15?`Late season (Wk ${wk})`:`Week ${wk||"?"}`;
  if(hr&&ar&&hr.w/(hr.w+hr.l||1)>=.5&&ar.w/(ar.w+ar.l||1)>=.5)detail+=" — both teams contending";
  return{score:base,max:10,name:"Game Stakes",desc:"Playoff importance, seeding/division implications",detail};
}

// 6. RIVALRY 0-10
function calcRivalry(g,d){
  let rb=rivBase(g.ht,g.at);
  if(divRivals(g.ht,g.at)&&rb<4)rb=4;
  if(sameConf(g.ht,g.at)&&rb<2)rb=2;
  const hr=parseRec(g.hr),ar=parseRec(g.ar);
  if(hr&&ar){const hPct=hr.w/(hr.w+hr.l||1);const aPct=ar.w/(ar.w+ar.l||1);
    if(hPct>=.65&&aPct>=.65)rb=Math.min(rb+2,10);else if(hPct>=.55&&aPct>=.55)rb=Math.min(rb+1,10)}
  if(g.season?.type===3){if(rb<5)rb=5;rb=Math.min(rb+1,10)}
  const score=Math.min(rb,10);
  let detail=rb>=8?"Storied rivalry":rb>=5?"Notable rivalry / strong matchup":rb>=3?"Division/conference matchup":"Non-rivalry";
  if(hr&&ar&&hr.w/(hr.w+hr.l||1)>=.6&&ar.w/(ar.w+ar.l||1)>=.6)detail+=" (both winning)";
  return{score,max:10,name:"Rivalry Factor",desc:"Historical rivalry + conference + both teams' quality",detail};
}

// 7. SCORING VOLUME 0-10
function calcVolume(g){
  const tot=g.hs+g.as;let score;
  if(tot>=70)score=10;else if(tot>=60)score=9;else if(tot>=50)score=8;
  else if(tot>=45)score=7;else if(tot>=40)score=6;else if(tot>=34)score=5;
  else if(tot>=27)score=4;else if(tot>=20)score=3;else if(tot>=14)score=2;else score=1;
  if(g.hs>=20&&g.as>=20)score=Math.min(score+1,10);
  return{score,max:10,name:"Scoring Volume",desc:"Total points and offensive balance",detail:`${tot} total (${g.as}-${g.hs})`};
}

// 8. TURNOVERS & MOMENTUM 0-15
// FIX #8: Include ALL turnovers on downs, not just red zone ones
function calcMomentum(plays){
  let ints=0,fum=0,dtd=0,blk=0,mfg=0,tod=0,saf=0;
  for(const p of plays){
    const tx=(p.text||"").toLowerCase();const ty=(p.type?.text||"").toLowerCase();
    if(tx.includes("intercept")||ty.includes("interception"))ints++;
    if(tx.includes("fumble")&&(tx.includes("recovered by")||tx.includes("forced")))fum++;
    if((tx.includes("intercept")||tx.includes("fumble"))&&tx.includes("touchdown"))dtd++;
    if(tx.includes("blocked")&&(tx.includes("punt")||tx.includes("field goal")||tx.includes("kick")))blk++;
    if(ty.includes("missed field goal")||(tx.includes("field goal")&&(tx.includes("no good")||tx.includes("missed")||tx.includes("wide"))))mfg++;
    // FIX: All turnovers on downs count
    if(ty.includes("turnover on downs"))tod++;
    if(tx.includes("safety")&&(ty.includes("safety")||tx.includes("tackled in end zone")))saf++;
  }
  let score=Math.round((ints+fum)*1.5+dtd*3+blk*3+mfg*1.5+tod*1.5+saf*2.5);
  score=Math.min(score,15);
  const parts=[];
  if(ints)parts.push(`${ints} INT${ints>1?"s":""}`);if(fum)parts.push(`${fum} fumble${fum>1?"s":""}`);
  if(dtd)parts.push(`${dtd} def/ST TD${dtd>1?"s":""}`);if(blk)parts.push(`${blk} block${blk>1?"s":""}`);
  if(tod)parts.push(`${tod} turnover${tod>1?"s":""} on downs`);
  if(mfg)parts.push(`${mfg} missed FG${mfg>1?"s":""}`);if(saf)parts.push(`${saf} safety`);
  return{score,max:15,name:"Turnovers & Momentum",desc:"INTs, fumbles, blocks, turnovers on downs, missed FGs, safeties",detail:parts.join(", ")||"Clean game"};
}

// 9. LEAD CHANGES 0-10
// FIX #9: Don't count the initial 0-0 as a "tie"
function calcLeads(ms){
  let ch=0,ties=0,leader="none";
  let hasScored=false; // Track whether any scoring has happened
  for(const m of ms){
    const nl=m.margin>0?"home":m.margin<0?"away":"tied";
    // Only start tracking after at least one team has scored
    if(!hasScored){if(m.hS>0||m.aS>0)hasScored=true;else continue}
    if(nl==="tied"&&leader!=="tied")ties++;
    if(nl!=="tied"&&nl!==leader&&leader!=="none"&&leader!=="tied")ch++;
    if(nl!=="tied")leader=nl;else leader="tied";
  }
  const score=Math.min(Math.round(ch*2+ties*1.5),10);
  return{score,max:10,name:"Lead Changes",desc:"Lead swaps and ties (after first score)",detail:`${ch} lead change${ch!==1?"s":""}, ${ties} tie${ties!==1?"s":""}`};
}

// 10. OVERTIME 0-5
function calcOT(tp){if(tp<=4)return{score:0,max:5,name:"Overtime",desc:"Overtime bonus",detail:"Regulation"};const ot=tp-4;return{score:Math.min(3+ot,5),max:5,name:"Overtime",desc:"Overtime bonus",detail:`${ot>1?ot+"x ":""}Overtime`}}

export function gradeFor(sc,mx){const p=sc/mx;if(p>=.9)return{g:"S",c:"s"};if(p>=.75)return{g:"A",c:"a"};if(p>=.6)return{g:"B",c:"b"};if(p>=.4)return{g:"C",c:"c"};if(p>=.2)return{g:"D",c:"d"};return{g:"F",c:"f"}}
export function oGrade(t){if(t>=95)return{g:"S",l:"ALL-TIME CLASSIC",c:"s"};if(t>=82)return{g:"A",l:"INSTANT CLASSIC",c:"a"};if(t>=65)return{g:"B",l:"GREAT GAME",c:"b"};if(t>=45)return{g:"C",l:"SOLID GAME",c:"c"};if(t>=28)return{g:"D",l:"FORGETTABLE",c:"d"};return{g:"F",l:"SNOOZEFEST",c:"f"}}

// KEY PLAYS — chronological, penalty-aware, no FGs as "big plays"
export function extractKP(d){
  const plays=getAllPlays(d);const kp=[];
  for(const p of plays){
    const txt=p.text||"";const lo=txt.toLowerCase();const ty=(p.type?.text||"").toLowerCase();
    const y=p.statYardage||0;const per=p.period?.number||0;const clk=p.clock?.displayValue||"";
    const sl=clkSec(clk);const el=gameElapsed(per,clk);
    if(lo.includes("penalty")&&(lo.includes("nullif")||lo.includes("no play")||lo.includes("declined")))continue;
    if(ty.includes("penalty"))continue;
    if(ty.includes("extra point")||ty.includes("two-point")||ty.includes("kickoff"))continue;
    const isTD=lo.includes("touchdown")&&p.scoringPlay;
    const isINT=lo.includes("intercept");const isFum=lo.includes("fumble")&&lo.includes("recover");
    const isBlk=lo.includes("blocked");const isBig=y>=40;
    const isClutch=per===4&&sl!==null&&sl<=120&&p.scoringPlay;
    const isMFG=ty.includes("missed field goal")||(lo.includes("field goal")&&(lo.includes("no good")||lo.includes("missed")));
    const isTOD=ty.includes("turnover on downs");
    let tag=null;
    if(isClutch)tag="cl";else if(isTD&&y>=30)tag="td";else if(isBlk)tag="sp";
    else if(isINT||isFum)tag="to";else if(isMFG&&per>=3)tag="sp";
    else if(isTOD&&per>=3)tag="sp";else if(isBig)tag="bg";else if(isTD&&per>=4)tag="td";
    if(tag)kp.push({text:txt,period:per,clock:clk,tag,yards:y,elapsed:el});
  }
  kp.sort((a,b)=>a.elapsed-b.elapsed);
  return kp.slice(0,12);
}

export function buildBox(d){const hdr=d?.header?.competitions?.[0];return(hdr?.competitors||[]).map(c=>({team:c.team?.abbreviation||"???",win:c.winner,qs:(c.linescores||[]).map(q=>q.displayValue||q.value||0),total:c.score||0}))}

export function buildStats(d){
  const st=[];try{const bx=d?.boxscore?.teams||[];if(bx.length===2){
    const s0={},s1={};for(const s of(bx[0].statistics||[]))s0[s.name]=s.displayValue;for(const s of(bx[1].statistics||[]))s1[s.name]=s.displayValue;
    const names=[["totalYards","Total Yards"],["passingYards","Pass Yards"],["rushingYards","Rush Yards"],["turnovers","Turnovers"],["totalFirstDowns","First Downs"],["thirdDownEff","3rd Down"],["fourthDownEff","4th Down"],["totalPenaltiesYards","Penalties"],["possessionTime","Possession"]];
    for(const[k,l]of names)if(s0[k]||s1[k])st.push({label:l,away:s0[k]||"-",home:s1[k]||"-"});
  }}catch(e){}return st;
}

export function buildPlayerStats(d){
  const cats={passing:[],rushing:[],receiving:[]};
  try{for(const team of(d?.boxscore?.players||[])){
    const ta=team.team?.abbreviation||"";
    for(const sg of(team.statistics||[])){
      if(!sg.athletes||!sg.labels||!cats[sg.name])continue;
      for(const a of sg.athletes){
        const nm=a.athlete?.displayName||"";const st=a.stats||[];
        if(!nm||st.length===0)continue;
        const obj={name:nm,team:ta};
        for(let i=0;i<Math.min(sg.labels.length,st.length);i++)obj[sg.labels[i]]=st[i];
        cats[sg.name].push(obj);
      }
    }
  }}catch(e){}
  cats.passing=cats.passing.filter(p=>parseInt(p["YDS"]||"0")>=50).slice(0,2);
  cats.rushing=cats.rushing.filter(p=>parseInt(p["YDS"]||"0")>=20).slice(0,3);
  cats.receiving=cats.receiving.filter(p=>parseInt(p["YDS"]||"0")>=25).slice(0,4);
  return cats;
}

export function buildSummaryData(g,d,exc){
  const sp=d?.scoringPlays||[];const homeId=getHomeTeamId(d);const plays=getAllPlays(d);
  const scoringLog=sp.map(s=>{const isH=s.team?.id===homeId;
    return{team:isH?g.ht:g.at,period:`Q${s.period?.number||"?"}`,clock:s.clock?.displayValue||"",play:(s.text||s.type?.text||"").slice(0,180),
      runningScore:`${g.at} ${s.awayScore!=null?s.awayScore:"?"}, ${g.ht} ${s.homeScore!=null?s.homeScore:"?"}`}});
  const pStats=buildPlayerStats(d);
  const leaders=[];
  for(const p of(pStats.passing||[]))leaders.push(`${p.name} (${p.team}): ${p["C/ATT"]||"?"} passing, ${p.YDS||0} yds, ${p.TD||0} TD, ${p.INT||0} INT`);
  for(const p of(pStats.rushing||[]).slice(0,2))leaders.push(`${p.name} (${p.team}): ${p.CAR||"?"} carries, ${p.YDS||0} rush yds, ${p.TD||0} TD`);
  for(const p of(pStats.receiving||[]).slice(0,3))leaders.push(`${p.name} (${p.team}): ${p.REC||"?"} rec, ${p.YDS||0} rec yds, ${p.TD||0} TD`);
  const keyPlays=[];
  for(const p of plays){const txt=p.text||"";const lo=txt.toLowerCase();const ty=(p.type?.text||"").toLowerCase();const y=p.statYardage||0;
    if(lo.includes("intercept")||lo.includes("fumble")||(lo.includes("blocked")&&(lo.includes("punt")||lo.includes("field goal")))||ty.includes("missed field goal")||ty.includes("turnover on downs")||y>=40||lo.includes("safety"))
      keyPlays.push(`Q${p.period?.number||"?"} ${p.clock?.displayValue||""}: ${txt.slice(0,150)}`)}
  const box=buildBox(d);
  return{matchup:`${tn(g.at)} at ${tn(g.ht)}`,awayTeam:g.at,homeTeam:g.ht,
    finalScore:`${tn(g.at)} ${g.as}, ${tn(g.ht)} ${g.hs}`,awayRecord:g.ar,homeRecord:g.hr,
    date:new Date(g.date).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),
    venue:g.ven,attendance:g.att,context:g.season?.type===3?"Playoff game":`${g.season?.year} Season, Week ${g.week?.number}`,
    boxScore:box.map(r=>`${r.team}: ${r.qs.join(" | ")} = ${r.total}`).join("\n"),
    scoringPlays:scoringLog.slice(0,30),playerLeaders:leaders,keyNonScoringPlays:keyPlays.slice(0,12),
    excitementScore:exc.total,excitementVerdict:oGrade(exc.total).l,
    topCategories:Object.entries(exc.scores).sort((a,b)=>b[1].score/b[1].max-a[1].score/a[1].max).slice(0,3).map(([k,v])=>`${v.name}: ${v.detail}`)};
}
