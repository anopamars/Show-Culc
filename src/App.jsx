import { useState, useRef, useEffect, useCallback } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
var C = {
  bg:"#1E2416", card:"#252C18", cardB:"#2E3A1A", topbar:"#1C2010",
  accent:"#8A9A2A", accentDim:"#6A7A1A", accentText:"#D8E8B0",
  vinyl:"#4A7A5A", vinylDim:"#2A5A3A", vinylText:"#B0D8B8",
  inp:"#2A3018", border:"#3A4A20", borderLight:"#4A5A28",
  t1:"#D8E8B0", t2:"#A0B878", t3:"#7A8C60", t4:"#5A6A3A",
  red:"#C04030", redBg:"#2A1010", redBorder:"#6A2020",
  warn:"#2A2A10", warnT:"#C8B840",
  info:"#102820", infoT:"#60A878",
  ok:"#142A14", okT:"#6AC870",
  tip:"#1E2416", tipT:"#A0B060",
  statBg:"#222A14",
};
var F = "'Courier New',monospace";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
var WOOD_TEXTURES = [
  {id:"oak",           name:"Oak",        color:"#C8A46E",grain:"#B08040"},
  {id:"pine",          name:"Pine",       color:"#E8C878",grain:"#CCA850"},
  {id:"walnut",        name:"Walnut",     color:"#7A5C3A",grain:"#5A3C1A"},
  {id:"maple",         name:"Maple",      color:"#E0C89A",grain:"#C8A870"},
  {id:"laminate_grey", name:"Lam. Grey",  color:"#9EA8A0",grain:"#7A8880"},
  {id:"laminate_white",name:"Lam. White", color:"#E8EAE6",grain:"#C8CAC4"},
  {id:"dark_wenge",    name:"Wengé",      color:"#3A2A1A",grain:"#2A1A0A"},
  {id:"bamboo",        name:"Bamboo",     color:"#D4C090",grain:"#B8A068"},
];
var VINYL_COLORS = [
  {id:"stone_grey",  name:"Stone Grey", color:"#B0AEA8",stripe:"#989690"},
  {id:"warm_beige",  name:"Warm Beige", color:"#D4C4A0",stripe:"#BCA880"},
  {id:"concrete",    name:"Concrete",   color:"#8A8C88",stripe:"#747670"},
  {id:"white_marble",name:"W. Marble",  color:"#E8E6E0",stripe:"#D4D0C8"},
  {id:"dark_slate",  name:"Dark Slate", color:"#4A4C50",stripe:"#383A3E"},
  {id:"sand",        name:"Sand",       color:"#D8C89A",stripe:"#C4B080"},
];
var SEED_BOARDS = [
  {id:"b1",name:"Standard Laminate",widthMm:194, lengthMm:1380,texture:"laminate_grey"},
  {id:"b2",name:"Hardwood Oak",     widthMm:120, lengthMm:1200,texture:"oak"},
];
var SEED_VINYLS = [
  {id:"v1",name:"Standard Vinyl",  rollWidthMm:2000,rollLengthM:20,fixedWidth:false,color:"stone_grey"},
  {id:"v2",name:"Wide Vinyl Roll", rollWidthMm:4000,rollLengthM:20,fixedWidth:true, color:"warm_beige"},
];

var SK = {boards:"flc_boards",vinyls:"flc_vinyls",projects:"flc_projects",stock:"flc_stock",wasteLog:"flc_waste"};
var _sid = Date.now();
function uid(){ return "id_"+(++_sid); }

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function sGet(key){ try{var r=localStorage.getItem(key);return r?JSON.parse(r):null;}catch(e){return null;} }
function sSet(key,val){ try{localStorage.setItem(key,JSON.stringify(val));}catch(e){} }

// ═══════════════════════════════════════════════════════════════════════════════
// ◈ AI DECISION ENGINE — Floor Culc Intelligence Layer
// ═══════════════════════════════════════════════════════════════════════════════

// ─── AI CONSTANTS ─────────────────────────────────────────────────────────────
var AI_WEIGHTS = { waste:0.35, install:0.30, aesthetic:0.20, cost:0.15 };
var AI_MIN_CUT_MM = 80;       // hard veto: narrower = physically unsafe
var AI_WARN_CUT_MM = 120;     // soft warn: narrow but usable
var AI_WARN_WASTE_PCT = 15;   // soft warn threshold
var AI_HARD_WASTE_PCT = 30;   // hard flag threshold
var AI_ORIENTATIONS = [0, 90];
var AI_OFFSETS = [0, 0.25, 0.333, 0.5];     // as fraction of board width
var AI_STAGGERS = [0, 0.5, 0.333];           // brick bond patterns
var AI_CACHE = {};            // session layout cache — LRU 30 entries
var AI_CACHE_KEYS = [];

// ─── AI CACHE HELPERS ─────────────────────────────────────────────────────────
function aiCacheSet(key, val) {
  if (AI_CACHE_KEYS.length >= 30) { delete AI_CACHE[AI_CACHE_KEYS.shift()]; }
  AI_CACHE[key] = val;
  AI_CACHE_KEYS.push(key);
}
function aiCacheGet(key) { return AI_CACHE[key] || null; }

// ─── AI INPUT VALIDATOR ───────────────────────────────────────────────────────
// Returns array of { severity, code, msg, autoFix? }
function aiValidateRoom(room) {
  var w = parseFloat(room.width) || 0;
  var l = parseFloat(room.length) || 0;
  var issues = [];
  if (w <= 0 || l <= 0) return [{ severity:"block", code:"NO_DIMS", msg:"Enter room dimensions to begin." }];
  if (w < 0.5)  issues.push({ severity:"error", code:"TOO_NARROW", msg:"Width "+w+"m is unusually small. Double-check measurement." });
  if (l < 0.5)  issues.push({ severity:"error", code:"TOO_SHORT",  msg:"Length "+l+"m is unusually small. Double-check measurement." });
  if (w > 30)   issues.push({ severity:"warn",  code:"VERY_LARGE", msg:"Width "+w+"m — confirm this is correct (over 30m is rare indoors)." });
  if (l > 50)   issues.push({ severity:"warn",  code:"VERY_LONG",  msg:"Length "+l+"m — confirm this is correct." });
  if (l > 0 && w / l > 5) issues.push({ severity:"warn", code:"EXTREME_RATIO", msg:"Room is very narrow relative to length. Confirm dimensions." });
  if (w > 0 && l > 0 && w === Math.round(w) && l === Math.round(l))
    issues.push({ severity:"info", code:"ROUND_NUMBERS", msg:"Round numbers often indicate estimates — verify with a tape measure for accuracy." });
  return issues;
}

// ─── AI CORE: SCORE A SINGLE LAYOUT ──────────────────────────────────────────
function aiScoreLayout(rW, rL, bW, bL, offsetFrac, staggerFrac, orientation) {
  // Apply orientation — swap room dims if laying boards the other way
  var fw = orientation === 90 ? rL : rW;
  var fl = orientation === 90 ? rW : rL;

  var offsetMm = offsetFrac * bW * 1000;
  var effectiveW = fw - (offsetFrac * bW);
  if (effectiveW <= 0) return null;

  var cE = effectiveW / bW;
  var rE = fl / bL;
  var cols = Math.ceil(cE) + (offsetFrac > 0 ? 1 : 0);
  var rows = Math.ceil(rE);
  var total = cols * rows;
  var area = rW * rL;
  var bArea = bW * bL;
  var waste = ((total * bArea - area) / (total * bArea)) * 100;

  // Actual cut widths after offset
  var firstCutMm = offsetFrac > 0 ? offsetFrac * bW * 1000 : bW * 1000;
  var lastFracW = (effectiveW / bW) % 1;
  var lastCutMm = lastFracW > 0.001 ? lastFracW * bW * 1000 : bW * 1000;
  var lastRowFrac = rE % 1;
  var lastRowMm = lastRowFrac > 0.001 ? lastRowFrac * bL * 1000 : bL * 1000;

  var cuts = 0;
  if (lastFracW > 0.001) cuts += rows;
  if (lastRowFrac > 0.001) cuts += cols;
  if (lastFracW > 0.001 && lastRowFrac > 0.001) cuts -= 1;
  if (offsetFrac > 0) cuts += rows; // first column

  // ── HARD VETO ──────────────────────────────────────────────────────────────
  var vetoed = false;
  var vetoReason = null;
  if (lastCutMm > 0.001 && lastCutMm < AI_MIN_CUT_MM) { vetoed = true; vetoReason = "Last column "+lastCutMm.toFixed(0)+"mm — too narrow to install safely."; }
  if (firstCutMm < AI_MIN_CUT_MM && offsetFrac > 0) { vetoed = true; vetoReason = "First column offset "+firstCutMm.toFixed(0)+"mm — too narrow."; }
  if (lastRowMm > 0.001 && lastRowMm < AI_MIN_CUT_MM) { vetoed = true; vetoReason = "Last row "+lastRowMm.toFixed(0)+"mm — too narrow to install safely."; }
  if (waste > AI_HARD_WASTE_PCT) { vetoed = true; vetoReason = "Waste "+waste.toFixed(0)+"% exceeds maximum threshold."; }

  // ── SCORE COMPONENTS ───────────────────────────────────────────────────────
  // WasteScore: 100 at 0%, 0 at 30%+
  var wasteScore = Math.max(0, 1 - (waste / 30));

  // InstallScore: penalise narrow cuts and high cut counts
  var minCut = Math.min(lastCutMm || bW*1000, lastRowMm || bL*1000, firstCutMm);
  var installScore = minCut >= 200 ? 1.0
    : minCut >= AI_WARN_CUT_MM ? 0.75
    : minCut >= AI_MIN_CUT_MM  ? 0.4
    : 0;
  var cutRatioPenalty = Math.min(0.3, (cuts / Math.max(total, 1)) * 0.5);
  installScore = Math.max(0, installScore - cutRatioPenalty);

  // AestheticScore: symmetric cuts score highest
  var symmetry = 1 - Math.abs(firstCutMm - lastCutMm) / (bW * 1000);
  var balancePenalty = (lastCutMm < bW * 1000 * 0.35) ? 0.3 : 0; // < 35% looks bad
  var aestheticScore = Math.max(0, symmetry - balancePenalty);

  // CostScore: fewer boards = better (use waste as proxy)
  var costScore = Math.max(0, 1 - (waste / 25));

  var totalScore = (
    AI_WEIGHTS.waste    * wasteScore +
    AI_WEIGHTS.install  * installScore +
    AI_WEIGHTS.aesthetic * aestheticScore +
    AI_WEIGHTS.cost     * costScore
  );

  return {
    score: vetoed ? -1 : totalScore,
    vetoed, vetoReason,
    waste, total, cuts, bArea, area,
    cols, rows,
    firstCutMm, lastCutMm, lastRowMm,
    offsetMm, offsetFrac, staggerFrac, orientation,
    wasteScore, installScore, aestheticScore, costScore,
  };
}

// ─── AI OPTIMIZATION ENGINE ───────────────────────────────────────────────────
// Tests 24 candidates per board, ranks all, returns best + alternatives
function aiOptimize(room, board) {
  var rW = parseFloat(room.width) || 0;
  var rL = parseFloat(room.length) || 0;
  var bW = parseFloat(board.widthMm) / 1000;
  var bL = parseFloat(board.lengthMm) / 1000;
  if (rW <= 0 || rL <= 0 || bW <= 0 || bL <= 0) return null;

  var cacheKey = [rW, rL, board.id].join(":");
  var cached = aiCacheGet(cacheKey);
  if (cached) return cached;

  var candidates = [];
  AI_ORIENTATIONS.forEach(function(orient) {
    AI_OFFSETS.forEach(function(offset) {
      AI_STAGGERS.forEach(function(stagger) {
        var result = aiScoreLayout(rW, rL, bW, bL, offset, stagger, orient);
        if (result) {
          result.board = board;
          result.room = room;
          candidates.push(result);
        }
      });
    });
  });

  // Sort: vetoed last, then by score desc
  candidates.sort(function(a, b) {
    if (a.vetoed && !b.vetoed) return 1;
    if (!a.vetoed && b.vetoed) return -1;
    return b.score - a.score;
  });

  var valid = candidates.filter(function(c) { return !c.vetoed; });
  var recommended = valid[0] || candidates[0];

  // Named alternatives — best in each dimension
  var bestWaste = valid.slice().sort(function(a,b){ return a.waste - b.waste; })[0];
  var bestEase  = valid.slice().sort(function(a,b){ return a.cuts - b.cuts; })[0];
  var bestAesth = valid.slice().sort(function(a,b){ return b.aestheticScore - a.aestheticScore; })[0];

  var alternatives = [];
  if (bestWaste && bestWaste !== recommended)
    alternatives.push(Object.assign({}, bestWaste, { altLabel:"Lowest waste", altSub: bestWaste.waste.toFixed(1)+"% waste" }));
  if (bestEase && bestEase !== recommended && bestEase !== bestWaste)
    alternatives.push(Object.assign({}, bestEase, { altLabel:"Easiest cuts", altSub: bestEase.cuts+" cuts" }));
  if (bestAesth && bestAesth !== recommended && alternatives.length < 2)
    alternatives.push(Object.assign({}, bestAesth, { altLabel:"Best symmetry", altSub: bestAesth.firstCutMm.toFixed(0)+"mm balanced" }));

  var result = { recommended, alternatives, allCandidates: candidates, board };
  aiCacheSet(cacheKey, result);
  return result;
}

// ─── AI REASONING ENGINE ─────────────────────────────────────────────────────
// Generates human-readable explanation from score data
function aiGenerateReasoning(rec, alternatives) {
  if (!rec) return [];
  var lines = [];

  // Lead with primary win
  if (rec.waste < 5)
    lines.push("Waste at "+rec.waste.toFixed(1)+"% — well below the 8% industry standard. Minimal material cost.");
  else if (rec.waste < 10)
    lines.push("Waste at "+rec.waste.toFixed(1)+"% — within the acceptable 8–12% professional range.");
  else
    lines.push("Waste at "+rec.waste.toFixed(1)+"% — above ideal. Alternative layouts shown below.");

  // Offset explanation
  if (rec.offsetFrac > 0) {
    var balanced = Math.abs(rec.firstCutMm - rec.lastCutMm) < 20;
    if (balanced)
      lines.push("Starting "+rec.offsetMm.toFixed(0)+"mm from wall gives balanced "+rec.firstCutMm.toFixed(0)+"mm cuts on both sides — professional finish standard.");
    else
      lines.push("Starting offset of "+rec.offsetMm.toFixed(0)+"mm avoids a cut narrower than "+AI_MIN_CUT_MM+"mm.");
  } else {
    lines.push("No offset needed — cut widths are acceptable from the wall.");
  }

  // Orientation explanation
  if (rec.orientation === 90)
    lines.push("Laying boards across the short dimension reduces the number of board lengths needed and minimises seam lines in the most visible direction.");

  // Trade-off vs alternatives
  var bestWasteAlt = alternatives.find(function(a){ return a.altLabel === "Lowest waste"; });
  if (bestWasteAlt && bestWasteAlt.waste < rec.waste - 1)
    lines.push("Lowest-waste option saves "+(rec.waste - bestWasteAlt.waste).toFixed(1)+"% material but requires "+(bestWasteAlt.cuts - rec.cuts)+" more cuts — more labour for marginal material saving.");

  var easiestAlt = alternatives.find(function(a){ return a.altLabel === "Easiest cuts"; });
  if (easiestAlt && easiestAlt.cuts < rec.cuts)
    lines.push("Easiest option has "+easiestAlt.cuts+" cuts vs "+rec.cuts+" here — "+(rec.waste - easiestAlt.waste > 0 ? (rec.waste - easiestAlt.waste).toFixed(1)+"% more waste though." : "comparable waste."));

  return lines;
}

// ─── AI POKA-YOKE: LAYOUT PROBLEM DETECTOR ───────────────────────────────────
function aiDetectProblems(rec, board) {
  if (!rec) return [];
  var issues = [];
  var bW = board.widthMm;
  var bL = board.lengthMm;

  if (rec.lastCutMm > 0.001 && rec.lastCutMm < AI_MIN_CUT_MM)
    issues.push({ sev:"error", icon:"🚨", msg:"Last column is "+rec.lastCutMm.toFixed(0)+"mm — physically unsafe to install. Auto-offset applied.", fix:"offset" });
  if (rec.lastRowMm > 0.001 && rec.lastRowMm < AI_MIN_CUT_MM)
    issues.push({ sev:"error", icon:"🚨", msg:"Last row is "+rec.lastRowMm.toFixed(0)+"mm — too narrow. Adjust start position.", fix:"offset" });
  if (rec.lastCutMm > 0.001 && rec.lastCutMm < AI_WARN_CUT_MM && rec.lastCutMm >= AI_MIN_CUT_MM)
    issues.push({ sev:"warn", icon:"⚠️", msg:"Last column is "+rec.lastCutMm.toFixed(0)+"mm — narrow but usable. Consider symmetry offset." });
  if (rec.waste > AI_WARN_WASTE_PCT)
    issues.push({ sev:"warn", icon:"⚠️", msg:"Waste at "+rec.waste.toFixed(1)+"% — above 15%. See alternative board sizes in AI results." });
  if (rec.cuts > 0 && rec.cuts / Math.max(rec.total, 1) > 0.35)
    issues.push({ sev:"info", icon:"💡", msg:"High cut ratio ("+((rec.cuts/rec.total)*100).toFixed(0)+"% of boards cut). Pre-cut batches by size to save time on site." });

  return issues;
}

// ─── AI INSTALLER FINGERPRINT (Signature Feature) ────────────────────────────
// Builds personal waste model from completed job history
function aiGetInstallerProfile() {
  var profile = sGet("flc_ai_profile") || {
    wasteOverruns: [],       // {estimated, actual, boardType, roomArea}
    choiceLog: [],           // {recommended.score, chosen.offsetFrac, chosen.orientation}
    boardUsageCount: {},     // {boardId: count}
    commonRoomSizes: [],     // [[w, l], ...] last 20
    calibrationFactor: 0,    // avg boards over/under estimate
    jobsAnalysed: 0,
  };
  return profile;
}
function aiSaveInstallerProfile(profile) {
  sSet("flc_ai_profile", profile);
}
function aiLogChoice(recommended, chosen) {
  var profile = aiGetInstallerProfile();
  profile.choiceLog.push({
    ts: Date.now(),
    recScore: recommended.score,
    chosenOffset: chosen.offsetFrac,
    chosenOrient: chosen.orientation,
    override: chosen.offsetFrac !== recommended.offsetFrac || chosen.orientation !== recommended.orientation,
  });
  if (profile.choiceLog.length > 200) profile.choiceLog = profile.choiceLog.slice(-200);
  aiSaveInstallerProfile(profile);
}
function aiLogRoomSize(width, length) {
  var profile = aiGetInstallerProfile();
  profile.commonRoomSizes.push([parseFloat(width), parseFloat(length)]);
  if (profile.commonRoomSizes.length > 20) profile.commonRoomSizes = profile.commonRoomSizes.slice(-20);
  aiSaveInstallerProfile(profile);
}
function aiLogBoardChoice(boardId) {
  var profile = aiGetInstallerProfile();
  profile.boardUsageCount[boardId] = (profile.boardUsageCount[boardId] || 0) + 1;
  aiSaveInstallerProfile(profile);
}
function aiCalibrateFromWasteLogs(wasteLog) {
  if (!wasteLog || wasteLog.length < 3) return 0;
  var recent = wasteLog.slice(-10);
  var overrun = recent.reduce(function(sum, e) {
    return sum + (parseFloat(e.actual || 0) - parseFloat(e.estimated || 0));
  }, 0) / recent.length;
  var profile = aiGetInstallerProfile();
  profile.calibrationFactor = overrun;
  profile.jobsAnalysed = recent.length;
  aiSaveInstallerProfile(profile);
  return overrun;
}
function aiGetPersonalisedOrderQty(baseTotal, boardId, wasteLog) {
  var profile = aiGetInstallerProfile();
  var calibration = profile.calibrationFactor || 0;
  if (wasteLog && wasteLog.length >= 3) calibration = aiCalibrateFromWasteLogs(wasteLog);
  var adjusted = Math.ceil(baseTotal * 1.1 + calibration);
  return { adjusted, calibration, jobsAnalysed: profile.jobsAnalysed };
}
function aiGetPreferredBoardOrder(boards) {
  var profile = aiGetInstallerProfile();
  var counts = profile.boardUsageCount || {};
  return boards.slice().sort(function(a, b) {
    return (counts[b.id] || 0) - (counts[a.id] || 0);
  });
}

// ─── AI PANEL COMPONENT ───────────────────────────────────────────────────────
// Full AI results UI: recommended layout + alternatives + reasoning + problems
function AiPanel({ room, board, boards, wasteLog, onSelectAlternative }) {
  var p1 = useState(false);  var expanded = p1[0], setExpanded = p1[1];
  var p2 = useState(null);   var chosen = p2[0], setChosen = p2[1];

  var validation = aiValidateRoom(room);
  var blocked = validation.find(function(v){ return v.severity === "block"; });
  if (blocked) return null;
  var errors = validation.filter(function(v){ return v.severity === "error" || v.severity === "warn"; });

  var opt = aiOptimize(room, board);
  if (!opt) return null;

  var rec = chosen || opt.recommended;
  var reasoning = aiGenerateReasoning(rec, opt.alternatives);
  var problems = aiDetectProblems(rec, board);
  var orderInfo = aiGetPersonalisedOrderQty(rec.total, board.id, wasteLog);

  var confLevel = rec.score >= 0.75 ? "HIGH" : rec.score >= 0.5 ? "MEDIUM" : "REVIEW";
  var confColor = rec.score >= 0.75 ? C.okT : rec.score >= 0.5 ? C.warnT : C.red;
  var confBars  = rec.score >= 0.75 ? 4 : rec.score >= 0.5 ? 3 : 2;

  return (
    <div style={{background:"#1A2810",border:"2px solid "+C.accent,borderRadius:12,marginBottom:12,overflow:"hidden",boxShadow:"3px 3px 0 "+C.accentDim}}>

      {/* ── AI HEADER ── */}
      <div style={{background:"#141E0C",padding:"12px 14px",borderBottom:"1px solid "+C.cardB}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>◈</span>
            <div>
              <div style={{fontSize:10,fontWeight:800,color:C.accent,fontFamily:F,letterSpacing:3}}>AI DECISION ENGINE</div>
              <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:1}}>Tested {AI_ORIENTATIONS.length * AI_OFFSETS.length * AI_STAGGERS.length} layout strategies</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:C.t4,fontFamily:F,letterSpacing:1,marginBottom:3}}>CONFIDENCE</div>
            <div style={{display:"flex",gap:2,justifyContent:"flex-end"}}>
              {[1,2,3,4].map(function(i){
                return <div key={i} style={{width:8,height:14,borderRadius:2,background:i<=confBars?confColor:"#2A3A1A"}}/>;
              })}
            </div>
            <div style={{fontSize:8,color:confColor,fontFamily:F,fontWeight:700,marginTop:2}}>{confLevel}</div>
          </div>
        </div>
      </div>

      {/* ── INPUT WARNINGS ── */}
      {errors.length > 0 && errors.map(function(e, i){
        return (
          <div key={i} style={{background:e.severity==="error"?C.redBg:C.warn,padding:"8px 14px",borderBottom:"1px solid "+C.cardB,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:12,flexShrink:0}}>{e.severity==="error"?"🚨":"⚠️"}</span>
            <span style={{fontSize:11,color:e.severity==="error"?"#E07070":C.warnT,fontFamily:F,lineHeight:1.4}}>{e.msg}</span>
          </div>
        );
      })}

      {/* ── LAYOUT PROBLEMS ── */}
      {problems.map(function(p, i){
        return (
          <div key={i} style={{background:p.sev==="error"?C.redBg:p.sev==="warn"?C.warn:C.tip,padding:"8px 14px",borderBottom:"1px solid "+C.cardB,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:12,flexShrink:0}}>{p.icon}</span>
            <span style={{fontSize:11,color:p.sev==="error"?"#E07070":p.sev==="warn"?C.warnT:C.t3,fontFamily:F,lineHeight:1.4}}>{p.msg}</span>
          </div>
        );
      })}

      <div style={{padding:"12px 14px"}}>

        {/* ── RECOMMENDED LAYOUT ── */}
        <div style={{fontSize:9,letterSpacing:3,color:C.accent,fontWeight:700,fontFamily:F,marginBottom:10}}>◈ RECOMMENDED LAYOUT</div>
        <div className="grid-4" style={{marginBottom:12}}>
          {[
            ["WASTE",    rec.waste.toFixed(1)+"%", rec.waste>15?C.red:C.okT],
            ["BOARDS",   ""+rec.total,             C.accent],
            ["CUTS",     ""+rec.cuts,              rec.cuts>0?C.warnT:C.okT],
            ["SCORE",    (rec.score*100).toFixed(0), confColor],
          ].map(function(s){
            return (
              <div key={s[0]} style={{background:C.statBg,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                <div style={{fontSize:7,color:C.t4,letterSpacing:1,fontFamily:F,marginBottom:3}}>{s[0]}</div>
                <div style={{fontSize:15,fontWeight:800,color:s[2],fontFamily:F}}>{s[1]}</div>
              </div>
            );
          })}
        </div>

        {/* Layout parameters */}
        <div style={{background:C.statBg,borderRadius:8,padding:"10px 12px",marginBottom:12}}>
          {[
            ["Orientation", rec.orientation===90?"Across room (90°)":"Along room (0°)"],
            ["Start offset", rec.offsetMm > 0 ? rec.offsetMm.toFixed(0)+"mm from wall" : "From wall (no offset)"],
            ["First cut",    rec.firstCutMm.toFixed(0)+"mm"],
            ["Last cut W",   rec.lastCutMm > 0.001 ? rec.lastCutMm.toFixed(0)+"mm" : "Full board"],
            ["Last cut L",   rec.lastRowMm > 0.001 ? rec.lastRowMm.toFixed(0)+"mm" : "Full board"],
          ].map(function(r){
            return (
              <div key={r[0]} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid "+C.cardB,fontSize:11,fontFamily:F}}>
                <span style={{color:C.t3}}>{r[0]}</span>
                <span style={{fontWeight:700,color:C.t1}}>{r[1]}</span>
              </div>
            );
          })}
        </div>

        {/* ── WHY THIS LAYOUT (reasoning) ── */}
        <button onClick={function(){ setExpanded(!expanded); }}
          style={{width:"100%",background:"transparent",border:"1.5px solid "+C.border,borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",marginBottom:expanded?10:12}}>
          <span style={{fontSize:10,fontWeight:700,color:C.t2,fontFamily:F,letterSpacing:1}}>WHY THIS LAYOUT?</span>
          <span style={{fontSize:14,color:C.accent}}>{expanded?"▲":"▼"}</span>
        </button>

        {expanded && (
          <div style={{marginBottom:12}}>
            {reasoning.map(function(line, i){
              return (
                <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid "+C.cardB}}>
                  <span style={{color:C.accent,fontFamily:F,fontSize:12,flexShrink:0}}>→</span>
                  <span style={{fontSize:11,color:C.t2,fontFamily:F,lineHeight:1.5}}>{line}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── PERSONALISED ORDER QUANTITY (Installer Fingerprint) ── */}
        {orderInfo.jobsAnalysed >= 3 && (
          <div style={{background:"#141E0C",border:"1.5px solid "+C.accent,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:C.accent,fontFamily:F,fontWeight:700,marginBottom:6}}>◈ PERSONALISED FOR YOU</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:11,color:C.t3,fontFamily:F}}>Standard estimate</span>
              <span style={{fontSize:13,color:C.t1,fontFamily:F,fontWeight:700}}>{Math.ceil(rec.total*1.1)} boards</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:11,color:C.t3,fontFamily:F}}>Your history adds</span>
              <span style={{fontSize:13,color:C.warnT,fontFamily:F,fontWeight:700}}>{orderInfo.calibration > 0 ? "+"+orderInfo.calibration.toFixed(1) : orderInfo.calibration.toFixed(1)} boards avg</span>
            </div>
            <div style={{height:"1px",background:C.border,margin:"6px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:C.t1,fontFamily:F,fontWeight:700}}>RECOMMENDED ORDER</span>
              <span style={{fontSize:18,color:C.accent,fontFamily:F,fontWeight:800}}>{orderInfo.adjusted} boards</span>
            </div>
            <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:4}}>Based on your last {orderInfo.jobsAnalysed} similar jobs</div>
          </div>
        )}
        {orderInfo.jobsAnalysed < 3 && (
          <div style={{background:C.statBg,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,color:C.t3,fontFamily:F}}>RECOMMENDED ORDER</div>
                <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:2}}>+10% standard buffer</div>
              </div>
              <div style={{fontSize:20,fontWeight:800,color:C.accent,fontFamily:F}}>{Math.ceil(rec.total*1.1)}</div>
            </div>
            {orderInfo.jobsAnalysed < 3 && (
              <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:6,borderTop:"1px solid "+C.cardB,paddingTop:6}}>
                ◈ Complete {3 - orderInfo.jobsAnalysed} more job{3-orderInfo.jobsAnalysed!==1?"s":""} in Waste Tracker to unlock personalised order quantities.
              </div>
            )}
          </div>
        )}

        {/* ── ALTERNATIVES ── */}
        {opt.alternatives.length > 0 && (
          <div>
            <div style={{fontSize:9,letterSpacing:3,color:C.t3,fontWeight:700,fontFamily:F,marginBottom:8}}>ALTERNATIVES</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {opt.alternatives.map(function(alt, i){
                var isChosen = chosen && chosen.offsetFrac === alt.offsetFrac && chosen.orientation === alt.orientation;
                return (
                  <button key={i} onClick={function(){
                    var next = isChosen ? null : alt;
                    setChosen(next);
                    if (next) aiLogChoice(opt.recommended, next);
                    if (onSelectAlternative) onSelectAlternative(next || opt.recommended);
                  }} style={{background:isChosen?"#1E3020":C.statBg,border:"1.5px solid "+(isChosen?C.accent:C.border),borderRadius:10,padding:"10px 12px",cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:11,fontWeight:700,color:isChosen?C.accent:C.t2,fontFamily:F}}>{alt.altLabel}</span>
                      <span style={{fontSize:9,color:isChosen?C.accent:C.t4,fontFamily:F}}>{isChosen?"SELECTED ✓":"TAP TO USE"}</span>
                    </div>
                    <div style={{display:"flex",gap:10,fontSize:10,color:C.t3,fontFamily:F}}>
                      <span>Waste: <strong style={{color:C.t2}}>{alt.waste.toFixed(1)}%</strong></span>
                      <span>Cuts: <strong style={{color:C.t2}}>{alt.cuts}</strong></span>
                      <span>Score: <strong style={{color:confColor}}>{(alt.score*100).toFixed(0)}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI INPUT VALIDATOR BANNER ────────────────────────────────────────────────
function AiValidationBanner({ room }) {
  var issues = aiValidateRoom(room);
  var visible = issues.filter(function(i){ return i.severity !== "block"; });
  if (visible.length === 0) return null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
      {visible.map(function(issue, i){
        var bg = issue.severity==="error"?C.redBg : issue.severity==="warn"?C.warn : C.tip;
        var tc = issue.severity==="error"?"#E07070" : issue.severity==="warn"?C.warnT : C.t3;
        var icon = issue.severity==="error"?"🚨" : issue.severity==="warn"?"⚠️":"💡";
        return (
          <div key={i} style={{background:bg,borderRadius:8,padding:"8px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:12,flexShrink:0}}>{icon}</span>
            <span style={{fontSize:11,color:tc,fontFamily:F,lineHeight:1.4}}>{issue.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI QUICK STATS BAR ───────────────────────────────────────────────────────
// Lightweight AI summary shown on Home screen — no full panel
function AiQuickBar({ room, board }) {
  var w = parseFloat(room.width)||0, l = parseFloat(room.length)||0;
  if (w<=0||l<=0||!board) return null;
  var opt = aiOptimize(room, board);
  if (!opt || !opt.recommended) return null;
  var rec = opt.recommended;
  var conf = rec.score >= 0.75 ? C.okT : rec.score >= 0.5 ? C.warnT : C.red;
  return (
    <div style={{background:"#141E0C",border:"1.5px solid "+C.accent,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:9,letterSpacing:2,color:C.accent,fontFamily:F,fontWeight:700}}>◈ AI OPTIMAL LAYOUT</div>
        <div style={{fontSize:9,color:conf,fontFamily:F,fontWeight:700}}>{(rec.score*100).toFixed(0)}/100</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        {[
          ["WASTE",  rec.waste.toFixed(1)+"%", rec.waste>15?C.red:C.okT],
          ["BOARDS", ""+rec.total,             C.accent],
          ["CUTS",   ""+rec.cuts,              rec.cuts>0?C.warnT:C.okT],
          ["OFFSET", rec.offsetMm>0?rec.offsetMm.toFixed(0)+"mm":"None", C.t2],
        ].map(function(s){
          return (
            <div key={s[0]} style={{flex:1,background:C.statBg,borderRadius:6,padding:"6px 4px",textAlign:"center"}}>
              <div style={{fontSize:7,color:C.t4,letterSpacing:1,fontFamily:F,marginBottom:2}}>{s[0]}</div>
              <div style={{fontSize:12,fontWeight:800,color:s[2],fontFamily:F}}>{s[1]}</div>
            </div>
          );
        })}
      </div>
      {opt.alternatives.length > 0 && (
        <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:6}}>
          {opt.alternatives.length} alternative{opt.alternatives.length>1?"s":""} available in Results →
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// END AI ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CALC HELPERS ─────────────────────────────────────────────────────────────
function calcBoard(room, board){
  var rW=parseFloat(room.width)||0, rL=parseFloat(room.length)||0;
  var bW=parseFloat(board.widthMm)/1000||0, bL=parseFloat(board.lengthMm)/1000||0;
  if(rW<=0||rL<=0||bW<=0||bL<=0) return null;
  var area=rW*rL, bArea=bW*bL;
  var cE=rW/bW, rE=rL/bL;
  var cols=Math.ceil(cE), rows=Math.ceil(rE), total=cols*rows;
  var waste=((total*bArea-area)/(total*bArea)*100);
  var hpX=cE%1>0.001, hpY=rE%1>0.001;
  var remXmm=hpX?(cE%1)*bW*1000:0;
  var remYmm=hpY?(rE%1)*bL*1000:0;
  var cuts=(hpX?rows:0)+(hpY?cols:0)-(hpX&&hpY?1:0);
  return {rW,rL,bW,bL,area,bArea,cE,rE,cols,rows,total,waste,hpX,hpY,remXmm,remYmm,cuts};
}
function calcVinyl(room, vinyl){
  var rW=parseFloat(room.width)||0, rL=parseFloat(room.length)||0;
  var rollW=parseFloat(vinyl.rollWidthMm)/1000||0;
  var rollL=parseFloat(vinyl.rollLengthM)||0;
  if(rW<=0||rL<=0||rollW<=0||rollL<=0) return null;
  var strips=Math.ceil(rW/rollW), totalLen=strips*rL;
  var rolls=Math.ceil(totalLen/rollL);
  var matArea=rolls*rollW*rollL, roomArea=rW*rL;
  var waste=(matArea-roomArea)/matArea*100;
  var partial=(rW/rollW)%1>0.001;
  var partialMm=partial?(rW/rollW)%1*rollW*1000:0;
  return {rW,rL,rollW,rollL,strips,totalLen,rolls,matArea,roomArea,waste,partial,partialMm};
}
function buildCuttingList(room, board){
  var d=calcBoard(room,board); if(!d) return [];
  var list=[];
  if(d.hpX){
    list.push({qty:d.rows,w:Math.round(d.remXmm),l:Math.round(board.lengthMm),note:"Last column — cut to width"});
  }
  if(d.hpY){
    list.push({qty:d.cols,w:Math.round(board.widthMm),l:Math.round(d.remYmm),note:"Last row — cut to length"});
  }
  if(d.hpX&&d.hpY){
    list.push({qty:1,w:Math.round(d.remXmm),l:Math.round(d.remYmm),note:"Corner piece — cut both dimensions"});
  }
  if(list.length===0){
    list.push({qty:0,w:0,l:0,note:"No cuts needed — perfect fit!"});
  }
  return list;
}

// ─── FLOOR CANVAS ─────────────────────────────────────────────────────────────
function FloorCanvas({room,board,height}){
  var h=height||220;
  var ref=useRef(null);
  var draw=useCallback(function(){
    var c=ref.current; if(!c) return;
    var ctx=c.getContext("2d"); var W=c.width,H=c.height;
    ctx.clearRect(0,0,W,H);
    var rW=parseFloat(room.width)||0,rL=parseFloat(room.length)||0;
    var bW=parseFloat(board.widthMm)/1000||0.194,bL=parseFloat(board.lengthMm)/1000||1.38;
    if(rW<=0||rL<=0||bW<=0||bL<=0) return;
    var pad=36,aw=W-pad*2,ah=H-pad*2;
    var sc=Math.min(aw/rW,ah/rL);
    var dw=rW*sc,dh=rL*sc,ox=pad+(aw-dw)/2,oy=pad+(ah-dh)/2;
    var bpw=bW*sc,bpl=bL*sc;
    var cols=Math.ceil(rW/bW),rows=Math.ceil(rL/bL);
    var tex=WOOD_TEXTURES.find(function(t){return t.id===board.texture;})||WOOD_TEXTURES[0];
    ctx.save();ctx.beginPath();ctx.rect(ox,oy,dw,dh);ctx.clip();
    for(var row=0;row<rows;row++){for(var col=0;col<cols;col++){
      var x=ox+col*bpw,y=oy+row*bpl;
      var px=col===cols-1&&(rW/bW)%1>0.001,py=row===rows-1&&(rL/bL)%1>0.001;
      ctx.fillStyle=(px||py)?"rgba(220,60,40,0.45)":(row+col)%2===0?tex.color:tex.grain;
      ctx.fillRect(x,y,bpw,bpl);
      if(!px&&!py){ctx.strokeStyle="rgba(0,0,0,0.1)";ctx.lineWidth=0.5;
        for(var g=1;g<3;g++){ctx.beginPath();ctx.moveTo(x+bpw/3*g,y);ctx.lineTo(x+bpw/3*g,y+bpl);ctx.stroke();}}
      ctx.strokeStyle="rgba(0,0,0,0.22)";ctx.lineWidth=0.7;ctx.strokeRect(x,y,bpw,bpl);
    }}
    ctx.restore();
    ctx.strokeStyle="#3A4A20";ctx.lineWidth=2.5;ctx.strokeRect(ox,oy,dw,dh);
    ctx.fillStyle="#B0C080";ctx.font="bold 11px "+F;ctx.textAlign="center";
    ctx.fillText(rW.toFixed(2)+" m",ox+dw/2,oy+dh+18);
    ctx.save();ctx.translate(ox-18,oy+dh/2);ctx.rotate(-Math.PI/2);ctx.fillText(rL.toFixed(2)+" m",0,0);ctx.restore();
  },[room,board]);
  useEffect(function(){
    var c=ref.current;if(!c)return;
    var ro=new ResizeObserver(function(){c.width=c.parentElement.clientWidth;c.height=h;draw();});
    ro.observe(c.parentElement);c.width=c.parentElement.clientWidth;c.height=h;draw();
    return function(){ro.disconnect();};
  },[draw,h]);
  return React.createElement("canvas",{ref:ref,style:{width:"100%",display:"block"}});
}

// ─── VINYL CANVAS ─────────────────────────────────────────────────────────────
function VinylCanvas({room,vinyl,height}){
  var h=height||220;
  var ref=useRef(null);
  var draw=useCallback(function(){
    var c=ref.current;if(!c)return;
    var ctx=c.getContext("2d");var W=c.width,H=c.height;
    ctx.clearRect(0,0,W,H);
    var rW=parseFloat(room.width)||0,rL=parseFloat(room.length)||0;
    var rollW=parseFloat(vinyl.rollWidthMm)/1000||2;
    if(rW<=0||rL<=0||rollW<=0)return;
    var pad=36,aw=W-pad*2,ah=H-pad*2;
    var sc=Math.min(aw/rW,ah/rL);
    var dw=rW*sc,dh=rL*sc,ox=pad+(aw-dw)/2,oy=pad+(ah-dh)/2;
    var vc=VINYL_COLORS.find(function(v){return v.id===vinyl.color;})||VINYL_COLORS[0];
    var strips=Math.ceil(rW/rollW),spx=rollW*sc;
    ctx.save();ctx.beginPath();ctx.rect(ox,oy,dw,dh);ctx.clip();
    for(var s=0;s<strips;s++){
      var x=ox+s*spx,partial=s===strips-1&&(rW/rollW)%1>0.001;
      ctx.fillStyle=partial?"rgba(220,60,40,0.35)":s%2===0?vc.color:vc.stripe;
      ctx.fillRect(x,oy,spx,dh);
      if(!partial){ctx.strokeStyle="rgba(255,255,255,0.2)";ctx.lineWidth=0.8;
        for(var g=1;g<6;g++){ctx.beginPath();ctx.moveTo(x+spx/6*g,oy);ctx.lineTo(x+spx/6*g,oy+dh);ctx.stroke();}}
      ctx.strokeStyle="rgba(0,0,0,0.3)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(x,oy);ctx.lineTo(x,oy+dh);ctx.stroke();
      var sw=Math.min(rollW,rW-s*rollW);
      ctx.fillStyle="rgba(0,0,0,0.55)";ctx.font="bold 9px "+F;ctx.textAlign="center";
      var lx=x+Math.min(spx,(ox+dw-x))/2;
      if(lx<ox+dw-4)ctx.fillText((sw*1000).toFixed(0)+"mm",lx,oy+12);
    }
    ctx.restore();
    ctx.strokeStyle="#3A5A3A";ctx.lineWidth=2.5;ctx.strokeRect(ox,oy,dw,dh);
    ctx.fillStyle="#B0C080";ctx.font="bold 11px "+F;ctx.textAlign="center";
    ctx.fillText(rW.toFixed(2)+" m",ox+dw/2,oy+dh+18);
    ctx.save();ctx.translate(ox-18,oy+dh/2);ctx.rotate(-Math.PI/2);ctx.fillText(rL.toFixed(2)+" m",0,0);ctx.restore();
  },[room,vinyl]);
  useEffect(function(){
    var c=ref.current;if(!c)return;
    var ro=new ResizeObserver(function(){c.width=c.parentElement.clientWidth;c.height=h;draw();});
    ro.observe(c.parentElement);c.width=c.parentElement.clientWidth;c.height=h;draw();
    return function(){ro.disconnect();};
  },[draw,h]);
  return React.createElement("canvas",{ref:ref,style:{width:"100%",display:"block"}});
}

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function Stat({label,value,accent,sub}){
  return (
    <div style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px 8px",textAlign:"center",flex:1}}>
      <div style={{fontSize:8,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:3}}>{label}</div>
      <div style={{fontSize:18,fontWeight:800,color:accent||C.t1,fontFamily:F,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:9,color:C.t4,marginTop:3,fontFamily:F}}>{sub}</div>}
    </div>
  );
}
function SH({label,vinyl}){
  return <div style={{fontSize:9,letterSpacing:3,color:vinyl?C.vinylText:C.t3,marginBottom:10,fontWeight:700,fontFamily:F}}>{label}</div>;
}
function Rec({recs}){
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {recs.map(function(r,i){
        return (
          <div key={i} style={{background:r.c,borderRadius:10,padding:"10px 12px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:14,flexShrink:0}}>{r.t}</span>
            <span style={{fontSize:12,color:r.tc,lineHeight:1.5,fontFamily:F}}>{r.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
function Row({k,v,dim}){
  return (
    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.cardB,fontSize:11}}>
      <span style={{color:dim?C.vinylText:C.t3,fontFamily:F}}>{k}</span>
      <span style={{fontWeight:700,color:C.t1,fontFamily:F,textAlign:"right",maxWidth:"55%"}}>{v}</span>
    </div>
  );
}

// ─── SHEET WRAPPER ────────────────────────────────────────────────────────────
function Sheet({onClose,children}){
  return (
    <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}} onClick={onClose}/>
      <div style={{position:"relative",background:C.card,borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto",paddingBottom:44,boxShadow:"0 -4px 40px rgba(0,0,0,0.4)"}}>
        <div style={{width:36,height:4,background:C.border,borderRadius:4,margin:"10px auto 0"}}/>
        {children}
      </div>
    </div>
  );
}
function SheetHead({title,color,onSave,saveLabel}){
  return (
    <div style={{padding:"12px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+C.cardB,position:"sticky",top:0,background:C.card,zIndex:1}}>
      <div style={{fontSize:12,fontWeight:800,fontFamily:F,letterSpacing:2,color:color||C.t1}}>{title}</div>
      {onSave&&<button onClick={onSave} style={{background:color||C.accent,border:"none",color:color===C.vinyl?"#FFF":C.topbar,borderRadius:8,padding:"7px 18px",fontSize:11,fontWeight:800,fontFamily:F,cursor:"pointer"}}>{saveLabel||"SAVE"}</button>}
    </div>
  );
}

// ─── BOARD RESULTS ────────────────────────────────────────────────────────────
function BoardResults({room,board}){
  var d=calcBoard(room,board); if(!d) return null;
  var recs=[];
  if(d.waste>15) recs.push({t:"⚠️",c:C.warn,tc:C.warnT,msg:"High waste ("+d.waste.toFixed(1)+"%). Try a board with different dimensions."});
  if(d.hpX) recs.push({t:"✂️",c:C.info,tc:C.infoT,msg:"Last column cut to "+d.remXmm.toFixed(0)+" mm wide. Consider half-board start offset for symmetry."});
  if(d.hpY) recs.push({t:"✂️",c:C.info,tc:C.infoT,msg:"Last row cut to "+d.remYmm.toFixed(0)+" mm long."});
  if(d.hpX&&d.remXmm<50) recs.push({t:"🚨",c:C.redBg,tc:"#E07070",msg:"Last column only "+d.remXmm.toFixed(0)+" mm — too narrow. Shift start by "+((d.bW*1000-d.remXmm)/2).toFixed(0)+" mm."});
  if(d.hpY&&d.remYmm<50) recs.push({t:"🚨",c:C.redBg,tc:"#E07070",msg:"Last row only "+d.remYmm.toFixed(0)+" mm — too narrow. Adjust start position."});
  if(!d.hpX&&!d.hpY) recs.push({t:"✅",c:C.ok,tc:C.okT,msg:"Perfect fit — no cuts needed."});
  recs.push({t:"📦",c:C.tip,tc:C.tipT,msg:"Order "+Math.ceil(d.total*1.1)+" boards (+10% for waste & repairs)."});
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:6}}>
        <Stat label="ROOM AREA" value={d.area.toFixed(2)+"m²"}/>
        <Stat label="BOARDS" value={d.total} accent={C.accent}/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <Stat label="CUTS" value={d.cuts} accent={d.cuts>0?C.red:C.okT}/>
        <Stat label="WASTE" value={d.waste.toFixed(1)+"%" } accent={d.waste>15?C.red:C.okT}/>
      </div>
      <div style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:12,marginBottom:14}}>
        <SH label="LAYOUT DETAIL"/>
        <Row k="Columns" v={d.cols+" ("+d.cE.toFixed(2)+" exact)"}/>
        <Row k="Rows"    v={d.rows+" ("+d.rE.toFixed(2)+" exact)"}/>
        <Row k="Board"   v={board.widthMm+" × "+board.lengthMm+" mm"}/>
        <Row k="Coverage" v={(d.total*d.bArea).toFixed(2)+" m²"}/>
      </div>
      <SH label="RECOMMENDATIONS"/>
      <Rec recs={recs}/>
    </div>
  );
}

// ─── VINYL RESULTS ────────────────────────────────────────────────────────────
function VinylResults({room,vinyl}){
  var d=calcVinyl(room,vinyl); if(!d) return null;
  var recs=[];
  if(vinyl.fixedWidth&&d.partial) recs.push({t:"⚠️",c:C.warn,tc:C.warnT,msg:"Fixed-width roll ("+vinyl.rollWidthMm+" mm). Last strip cut to "+d.partialMm.toFixed(0)+" mm — offcut wasted."});
  if(d.partial&&!vinyl.fixedWidth) recs.push({t:"✂️",c:C.info,tc:C.infoT,msg:"Last strip cut to "+d.partialMm.toFixed(0)+" mm. Offcut ("+((d.rollW*1000)-d.partialMm).toFixed(0)+" mm) may be reusable."});
  if(!d.partial) recs.push({t:"✅",c:C.ok,tc:C.okT,msg:"Roll width divides perfectly — no side-cut waste."});
  if(d.waste>20) recs.push({t:"⚠️",c:C.warn,tc:C.warnT,msg:"High waste ("+d.waste.toFixed(1)+"%). A roll closer to "+(d.rW/d.strips*1000).toFixed(0)+" mm wide would be more efficient."});
  recs.push({t:"📏",c:C.tip,tc:C.tipT,msg:"Lay strips parallel to the longest wall to minimise visible seams."});
  recs.push({t:"📦",c:C.tip,tc:C.tipT,msg:"Order "+Math.ceil(d.rolls*1.1)+" rolls (+10% buffer). Each: "+vinyl.rollWidthMm+" mm × "+d.rollL+" m."});
  return (
    <div>
      <div style={{display:"flex",gap:6,marginBottom:6}}>
        <Stat label="ROOM AREA" value={d.roomArea.toFixed(2)+"m²"}/>
        <Stat label="ROLLS" value={d.rolls} accent={C.vinyl}/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        <Stat label="STRIPS" value={d.strips} accent={C.vinyl} sub={vinyl.rollWidthMm+"mm ea"}/>
        <Stat label="WASTE" value={d.waste.toFixed(1)+"%" } accent={d.waste>20?C.red:C.okT}/>
      </div>
      <div style={{background:C.statBg,border:"1.5px solid "+C.vinylDim,borderRadius:10,padding:12,marginBottom:14}}>
        <SH label="VINYL DETAIL" vinyl/>
        <Row k="Roll width"    v={vinyl.rollWidthMm+" mm"} dim/>
        <Row k="Roll length"   v={d.rollL+" m"} dim/>
        <Row k="Strips across" v={""+d.strips} dim/>
        <Row k="Total length"  v={d.totalLen.toFixed(2)+" m"} dim/>
        <Row k="Fixed width"   v={vinyl.fixedWidth?"Yes — no reuse":"No — reusable"} dim/>
      </div>
      <SH label="RECOMMENDATIONS" vinyl/>
      <Rec recs={recs}/>
    </div>
  );
}

// ─── CUTTING LIST ─────────────────────────────────────────────────────────────
function CuttingList({room,board}){
  var list=buildCuttingList(room,board);
  if(!list||list.length===0) return null;
  return (
    <div>
      <SH label="CUTTING LIST"/>
      {list[0].qty===0?(
        <div style={{background:C.ok,borderRadius:10,padding:"12px",textAlign:"center",fontFamily:F,fontSize:12,color:C.okT}}>✅ No cuts needed — perfect fit!</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {list.map(function(item,i){
            return (
              <div key={i} style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:C.t1,fontFamily:F}}>✂️ {item.note}</span>
                  <span style={{fontSize:13,fontWeight:800,color:C.accent,fontFamily:F}}>×{item.qty}</span>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,background:C.cardB,borderRadius:8,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:3}}>WIDTH</div>
                    <div style={{fontSize:16,fontWeight:800,color:C.accentText,fontFamily:F}}>{item.w}mm</div>
                  </div>
                  <div style={{flex:1,background:C.cardB,borderRadius:8,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:3}}>LENGTH</div>
                    <div style={{fontSize:16,fontWeight:800,color:C.accentText,fontFamily:F}}>{item.l}mm</div>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{background:C.warn,borderRadius:10,padding:"10px 12px",fontSize:11,color:C.warnT,fontFamily:F,lineHeight:1.5}}>
            💡 Batch-cut all pieces of the same size together. Sort by cut width to minimise saw adjustments.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BOARD EDITOR ─────────────────────────────────────────────────────────────
function BoardSheet({board,onUpdate,onClose,onDelete,canDelete}){
  var p=useState(Object.assign({},board)); var l=p[0],setL=p[1];
  function u(k,v){setL(function(x){var n=Object.assign({},x);n[k]=v;return n;});}
  var fi={background:C.inp,border:"2px solid "+C.border,borderRadius:8,padding:"10px 12px",fontSize:18,fontWeight:700,fontFamily:F,boxSizing:"border-box",outline:"none",width:"100%",color:C.t1};
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="EDIT BOARD" onSave={function(){onUpdate(l);onClose();}}/>
      <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>NAME</div>
          <input value={l.name} onChange={function(e){u("name",e.target.value);}} style={Object.assign({},fi,{fontSize:15,fontWeight:600})}/>
        </div>
        <div className="grid-2" style={{gap:12}}>
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>WIDTH (mm)</div>
            <input type="number" min="1" inputMode="decimal" value={l.widthMm} onChange={function(e){u("widthMm",e.target.value);}} style={fi}/>
          </div>
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>LENGTH (mm)</div>
            <input type="number" min="1" inputMode="decimal" value={l.lengthMm} onChange={function(e){u("lengthMm",e.target.value);}} style={fi}/>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:8}}>TEXTURE</div>
          <div className="grid-2" style={{gap:8}}>
            {WOOD_TEXTURES.map(function(t){
              return (
                <button key={t.id} onClick={function(){u("texture",t.id);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:l.texture===t.id?"2.5px solid "+C.accent:"1.5px solid "+C.border,borderRadius:10,background:l.texture===t.id?C.cardB:C.card,cursor:"pointer"}}>
                  <div style={{width:24,height:24,background:t.color,borderRadius:5,border:"2px solid "+t.grain,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:600,fontFamily:F,color:C.t2}}>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        {canDelete&&<button onClick={function(){onDelete();onClose();}} style={{background:C.redBg,border:"2px solid "+C.redBorder,borderRadius:10,padding:12,color:"#E07070",fontSize:12,fontWeight:700,fontFamily:F,cursor:"pointer"}}>🗑 DELETE BOARD</button>}
      </div>
    </Sheet>
  );
}

// ─── VINYL EDITOR ─────────────────────────────────────────────────────────────
function VinylSheet({vinyl,onUpdate,onClose,onDelete,canDelete}){
  var p=useState(Object.assign({},vinyl)); var l=p[0],setL=p[1];
  function u(k,v){setL(function(x){var n=Object.assign({},x);n[k]=v;return n;});}
  var fi={background:C.inp,border:"2px solid "+C.vinylDim,borderRadius:8,padding:"10px 12px",fontSize:18,fontWeight:700,fontFamily:F,boxSizing:"border-box",outline:"none",width:"100%",color:C.t1};
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="EDIT VINYL" color={C.vinyl} onSave={function(){onUpdate(l);onClose();}}/>
      <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.vinylText,fontFamily:F,marginBottom:6}}>NAME</div>
          <input value={l.name} onChange={function(e){u("name",e.target.value);}} style={Object.assign({},fi,{fontSize:15,fontWeight:600})}/>
        </div>
        <div className="grid-2" style={{gap:12}}>
          <div>
            <input type="number" min="1" inputMode="decimal" value={l.rollWidthMm} onChange={function(e){u("rollWidthMm",e.target.value);}} style={fi}/>
          </div>
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.vinylText,fontFamily:F,marginBottom:6}}>ROLL LENGTH (m)</div>
            <input type="number" min="1" inputMode="decimal" value={l.rollLengthM} onChange={function(e){u("rollLengthM",e.target.value);}} style={fi}/>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.vinylText,fontFamily:F,marginBottom:8}}>ROLL TYPE</div>
          <div className="grid-2" style={{gap:8}}>
            <button onClick={function(){u("fixedWidth",false);}} style={{padding:"10px",border:!l.fixedWidth?"2.5px solid "+C.vinyl:"1.5px solid "+C.border,borderRadius:10,background:!l.fixedWidth?C.cardB:C.card,cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:18,marginBottom:4}}>♻️</div>
              <div style={{fontSize:12,fontWeight:700,fontFamily:F,color:C.t1}}>Flexible</div>
              <div style={{fontSize:10,color:C.t3,fontFamily:F,marginTop:2}}>Offcuts reusable</div>
            </button>
            <button onClick={function(){u("fixedWidth",true);}} style={{padding:"10px",border:l.fixedWidth?"2.5px solid "+C.vinyl:"1.5px solid "+C.border,borderRadius:10,background:l.fixedWidth?C.cardB:C.card,cursor:"pointer",textAlign:"left"}}>
              <div style={{fontSize:18,marginBottom:4}}>📏</div>
              <div style={{fontSize:12,fontWeight:700,fontFamily:F,color:C.t1}}>Fixed Width</div>
              <div style={{fontSize:10,color:C.t3,fontFamily:F,marginTop:2}}>No offcut reuse</div>
            </button>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.vinylText,fontFamily:F,marginBottom:8}}>COLOUR</div>
          <div className="grid-2" style={{gap:8}}>
            {VINYL_COLORS.map(function(vc){
              return (
                <button key={vc.id} onClick={function(){u("color",vc.id);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:l.color===vc.id?"2.5px solid "+C.vinyl:"1.5px solid "+C.border,borderRadius:10,background:C.card,cursor:"pointer"}}>
                  <div style={{width:24,height:24,background:vc.color,borderRadius:5,border:"2px solid "+vc.stripe,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:600,fontFamily:F,color:C.t2}}>{vc.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        {canDelete&&<button onClick={function(){onDelete();onClose();}} style={{background:C.redBg,border:"2px solid "+C.redBorder,borderRadius:10,padding:12,color:"#E07070",fontSize:12,fontWeight:700,fontFamily:F,cursor:"pointer"}}>🗑 DELETE VINYL</button>}
      </div>
    </Sheet>
  );
}

// ─── PDF GENERATOR ────────────────────────────────────────────────────────────
function generatePDF(project,boards,vinyls){
  var lines=[];
  var date=new Date().toLocaleDateString("en-ZA",{day:"2-digit",month:"long",year:"numeric"});
  lines.push("<!DOCTYPE html><html><head><meta charset='utf-8'>");
  lines.push("<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Courier New',monospace;background:#fff;color:#1a1a1a;padding:32px;max-width:800px;margin:0 auto;}");
  lines.push("h1{font-size:26px;letter-spacing:4px;color:#3a4a20;border-bottom:3px solid #8a9a2a;padding-bottom:10px;margin-bottom:6px;}");
  lines.push(".sub{font-size:11px;color:#6a7a4a;letter-spacing:2px;margin-bottom:28px;}");
  lines.push("h2{font-size:12px;letter-spacing:3px;color:#5a6a3a;margin:22px 0 10px;border-left:3px solid #8a9a2a;padding-left:10px;}");
  lines.push(".grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:#3a4a20;border:1.5px solid #3a4a20;margin-bottom:14px;}");
  lines.push(".cell{background:#f8faf0;padding:10px 12px;}.cell .lbl{font-size:8px;letter-spacing:2px;color:#888;}.cell .val{font-size:18px;font-weight:800;color:#1a1a1a;}");
  lines.push(".table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;}");
  lines.push(".table th{background:#3a4a20;color:#d8e8b0;padding:7px 10px;text-align:left;letter-spacing:1px;}");
  lines.push(".table td{padding:7px 10px;border-bottom:1px solid #e8f0d8;}");
  lines.push(".table tr:nth-child(even) td{background:#f5f8ec;}");
  lines.push(".cut{background:#fff8e0;border:1px solid #c8b040;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11px;}");
  lines.push(".rec{border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:11px;display:flex;gap:8px;}");
  lines.push(".footer{margin-top:40px;padding-top:14px;border-top:1.5px solid #c8d8a0;font-size:9px;color:#aaa;letter-spacing:2px;display:flex;justify-content:space-between;}");
  lines.push("@media print{body{padding:16px;}}</style></head><body>");
  lines.push("<h1>◈ FLOOR CULC</h1>");
  lines.push("<div class='sub'>PROJECT QUOTE — "+project.name.toUpperCase()+" — "+date+"</div>");
  if(project.client) lines.push("<p style='font-size:12px;margin-bottom:20px;color:#555;'>Client: <strong>"+project.client+"</strong></p>");

  project.rooms.forEach(function(room,ri){
    lines.push("<h2>ROOM "+(ri+1)+": "+room.name.toUpperCase()+" &nbsp; "+room.width+"m × "+room.length+"m = "+(parseFloat(room.width)*parseFloat(room.length)).toFixed(2)+"m²</h2>");
    var board=boards.find(function(b){return b.id===room.boardId;});
    var vinyl=vinyls.find(function(v){return v.id===room.vinylId;});
    if(board&&room.width&&room.length){
      var d=calcBoard(room,board);
      if(d){
        lines.push("<div class='grid'>");
        lines.push("<div class='cell'><div class='lbl'>BOARDS</div><div class='val'>"+d.total+"</div></div>");
        lines.push("<div class='cell'><div class='lbl'>ORDER</div><div class='val'>"+Math.ceil(d.total*1.1)+"</div></div>");
        lines.push("<div class='cell'><div class='lbl'>CUTS</div><div class='val'>"+d.cuts+"</div></div>");
        lines.push("<div class='cell'><div class='lbl'>WASTE</div><div class='val'>"+d.waste.toFixed(1)+"%</div></div>");
        lines.push("</div>");
        lines.push("<p style='font-size:11px;color:#555;margin-bottom:10px;'>Board: <strong>"+board.name+"</strong> — "+board.widthMm+"×"+board.lengthMm+" mm</p>");
        var cuts=buildCuttingList(room,board);
        if(cuts.length>0&&cuts[0].qty>0){
          lines.push("<p style='font-size:10px;letter-spacing:2px;color:#6a7a4a;margin-bottom:6px;'>CUTTING LIST</p>");
          cuts.forEach(function(item){
            lines.push("<div class='cut'>✂️ <strong>"+item.qty+"×</strong> — "+item.w+"mm × "+item.l+"mm &nbsp; <span style='color:#888;'>"+item.note+"</span></div>");
          });
        }
      }
    }
    if(vinyl&&room.width&&room.length){
      var dv=calcVinyl(room,vinyl);
      if(dv){
        lines.push("<p style='font-size:11px;color:#4a7a5a;margin:10px 0 4px;'><strong>Vinyl: "+vinyl.name+"</strong> — "+vinyl.rollWidthMm+"mm × "+vinyl.rollLengthM+"m</p>");
        lines.push("<p style='font-size:11px;color:#555;margin-bottom:10px;'>"+dv.strips+" strip"+(dv.strips>1?"s":"")+", "+dv.rolls+" roll"+(dv.rolls>1?"s":"")+" needed (order "+Math.ceil(dv.rolls*1.1)+" with buffer)</p>");
      }
    }
  });

  // Waste log
  if(project.wasteLog&&project.wasteLog.length>0){
    lines.push("<h2>WASTE TRACKER</h2>");
    lines.push("<table class='table'><tr><th>ROOM</th><th>ESTIMATED</th><th>ACTUAL USED</th><th>DIFF</th><th>NOTES</th></tr>");
    project.wasteLog.forEach(function(w){
      var diff=w.actual-w.estimated;
      lines.push("<tr><td>"+w.roomName+"</td><td>"+w.estimated+"</td><td>"+w.actual+"</td><td style='color:"+(diff>0?"#c04030":"#3a8a3a")+"'>"+(diff>0?"+":"")+diff+"</td><td style='color:#888;'>"+w.notes+"</td></tr>");
    });
    lines.push("</table>");
  }

  // Leftover stock
  if(project.stock&&project.stock.length>0){
    lines.push("<h2>LEFTOVER STOCK</h2>");
    lines.push("<table class='table'><tr><th>MATERIAL</th><th>QTY</th><th>SIZE</th><th>LOCATION</th></tr>");
    project.stock.forEach(function(s){
      lines.push("<tr><td>"+s.name+"</td><td>"+s.qty+"</td><td>"+s.size+"</td><td style='color:#888;'>"+s.location+"</td></tr>");
    });
    lines.push("</table>");
  }

  lines.push("<div class='footer'><span>◈ FLOOR CULC — GENERATED "+date+"</span><span>"+project.name+"</span></div>");
  lines.push("</body></html>");

  var blob=new Blob([lines.join("\n")],{type:"text/html"});
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url; a.download=project.name.replace(/\s+/g,"_")+"_quote.html"; a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
}

// ─── PROJECT ROOM EDITOR ──────────────────────────────────────────────────────
function RoomEditor({room,boards,vinyls,onUpdate,onClose,onDelete}){
  var p=useState(Object.assign({},room)); var l=p[0],setL=p[1];
  function u(k,v){setL(function(x){var n=Object.assign({},x);n[k]=v;return n;});}
  var fi={background:C.inp,border:"2px solid "+C.border,borderRadius:8,padding:"10px 12px",fontSize:18,fontWeight:700,fontFamily:F,boxSizing:"border-box",outline:"none",width:"100%",color:C.t1};
  var selB=boards.find(function(b){return b.id===l.boardId;})||null;
  var selV=vinyls.find(function(v){return v.id===l.vinylId;})||null;
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="EDIT ROOM" onSave={function(){onUpdate(l);onClose();}}/>
      <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>ROOM NAME</div>
          <input value={l.name} onChange={function(e){u("name",e.target.value);}} style={Object.assign({},fi,{fontSize:15,fontWeight:600})} placeholder="e.g. Living Room"/>
        </div>
        <div className="grid-2" style={{gap:12}}>
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>WIDTH (m)</div>
            <input type="number" min="0.1" step="0.01" inputMode="decimal" value={l.width} onChange={function(e){u("width",e.target.value);}} style={fi} placeholder="4.50"/>
          </div>
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:6}}>LENGTH (m)</div>
            <input type="number" min="0.1" step="0.01" inputMode="decimal" value={l.length} onChange={function(e){u("length",e.target.value);}} style={fi} placeholder="6.20"/>
          </div>
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontFamily:F,marginBottom:8}}>BOARD TYPE</div>
          {boards.map(function(b){
            var t=WOOD_TEXTURES.find(function(x){return x.id===b.texture;});
            return (
              <button key={b.id} onClick={function(){u("boardId",b.id);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:l.boardId===b.id?"2.5px solid "+C.accent:"1.5px solid "+C.border,borderRadius:10,background:l.boardId===b.id?C.cardB:C.card,cursor:"pointer",width:"100%",marginBottom:6}}>
                <div style={{width:28,height:28,background:t?t.color:"#888",borderRadius:6,border:"2px solid "+(t?t.grain:"#666"),flexShrink:0}}/>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.t1,fontFamily:F}}>{b.name}</div>
                  <div style={{fontSize:10,color:C.t3,fontFamily:F}}>{b.widthMm}×{b.lengthMm}mm</div>
                </div>
              </button>
            );
          })}
        </div>
        <div>
          <div style={{fontSize:10,letterSpacing:2,color:C.vinylText,fontFamily:F,marginBottom:8}}>VINYL (optional)</div>
          <button onClick={function(){u("vinylId",null);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:!l.vinylId?"2.5px solid "+C.vinyl:"1.5px solid "+C.border,borderRadius:10,background:!l.vinylId?C.cardB:C.card,cursor:"pointer",width:"100%",marginBottom:6}}>
            <div style={{width:28,height:28,background:C.border,borderRadius:6,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✕</div>
            <span style={{fontSize:12,fontWeight:700,color:C.t2,fontFamily:F}}>No vinyl</span>
          </button>
          {vinyls.map(function(v){
            var vc=VINYL_COLORS.find(function(x){return x.id===v.color;});
            return (
              <button key={v.id} onClick={function(){u("vinylId",v.id);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:l.vinylId===v.id?"2.5px solid "+C.vinyl:"1.5px solid "+C.border,borderRadius:10,background:l.vinylId===v.id?C.cardB:C.card,cursor:"pointer",width:"100%",marginBottom:6}}>
                <div style={{width:28,height:28,background:vc?vc.color:"#888",borderRadius:6,border:"2px solid "+(vc?vc.stripe:"#666"),flexShrink:0}}/>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.t1,fontFamily:F}}>{v.name}</div>
                  <div style={{fontSize:10,color:C.vinylText,fontFamily:F}}>{v.rollWidthMm}mm × {v.rollLengthM}m</div>
                </div>
              </button>
            );
          })}
        </div>
        <button onClick={function(){onDelete();onClose();}} style={{background:C.redBg,border:"2px solid "+C.redBorder,borderRadius:10,padding:12,color:"#E07070",fontSize:12,fontWeight:700,fontFamily:F,cursor:"pointer"}}>🗑 REMOVE ROOM</button>
      </div>
    </Sheet>
  );
}

// ─── WASTE LOG SHEET ──────────────────────────────────────────────────────────
function WasteLogSheet({project,onUpdate,onClose}){
  var initLog=project.wasteLog||[];
  var p=useState(initLog.map(function(w){return Object.assign({},w);})); var log=p[0],setLog=p[1];
  function addEntry(){setLog(function(l){return l.concat([{id:uid(),roomName:"",estimated:0,actual:0,notes:""}]);});}
  function updEntry(id,k,v){setLog(function(l){return l.map(function(e){if(e.id!==id)return e;var n=Object.assign({},e);n[k]=v;return n;});});}
  function delEntry(id){setLog(function(l){return l.filter(function(e){return e.id!==id;});});}
  var fi={background:C.inp,border:"1.5px solid "+C.border,borderRadius:6,padding:"6px 8px",fontSize:13,fontWeight:600,fontFamily:F,color:C.t1,outline:"none",width:"100%",boxSizing:"border-box"};
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="WASTE TRACKER" onSave={function(){onUpdate(log);onClose();}} color={C.accent}/>
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:10,color:C.t3,fontFamily:F,lineHeight:1.5,marginBottom:4}}>Log actual boards used after each room is done. Compare to estimates to improve future quotes.</div>
        {log.map(function(entry){
          var diff=parseFloat(entry.actual||0)-parseFloat(entry.estimated||0);
          return (
            <div key={entry.id} style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <input value={entry.roomName} onChange={function(e){updEntry(entry.id,"roomName",e.target.value);}} placeholder="Room name" style={Object.assign({},fi,{flex:1,marginRight:8,fontSize:12})}/>
                <button onClick={function(){delEntry(entry.id);}} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <div className="grid-2" style={{gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,color:C.t3,fontFamily:F,marginBottom:4,letterSpacing:1}}>ESTIMATED</div>
                  <input type="number" value={entry.estimated} onChange={function(e){updEntry(entry.id,"estimated",e.target.value);}} inputMode="numeric" style={fi}/>
                </div>
                <div>
                  <div style={{fontSize:9,color:C.t3,fontFamily:F,marginBottom:4,letterSpacing:1}}>ACTUAL USED</div>
                  <input type="number" value={entry.actual} onChange={function(e){updEntry(entry.id,"actual",e.target.value);}} inputMode="numeric" style={Object.assign({},fi,{borderColor:diff>0?C.red:diff<0?C.okT:C.border})}/>
                </div>
              </div>
              {entry.actual>0&&<div style={{fontSize:11,fontWeight:700,color:diff>0?C.red:diff<0?C.okT:C.t3,fontFamily:F,marginBottom:8}}>{diff>0?"▲ "+diff+" over estimate":diff<0?"▼ "+Math.abs(diff)+" under estimate":"✓ Exact match"}</div>}
              <input value={entry.notes} onChange={function(e){updEntry(entry.id,"notes",e.target.value);}} placeholder="Notes (e.g. extra cuts for pillar)" style={Object.assign({},fi,{fontSize:11})}/>
            </div>
          );
        })}
        <button onClick={addEntry} style={{border:"2px dashed "+C.border,borderRadius:10,background:"transparent",padding:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer"}}>
          <span style={{fontSize:18,color:C.accent}}>＋</span>
          <span style={{fontSize:11,color:C.t3,fontFamily:F,letterSpacing:2}}>ADD ROOM ENTRY</span>
        </button>
      </div>
    </Sheet>
  );
}

// ─── LEFTOVER STOCK SHEET ─────────────────────────────────────────────────────
function StockSheet({stock,onUpdate,onClose}){
  var p=useState(stock.map(function(s){return Object.assign({},s);})); var items=p[0],setItems=p[1];
  function add(){setItems(function(l){return l.concat([{id:uid(),name:"",qty:1,size:"",location:""}]);});}
  function upd(id,k,v){setItems(function(l){return l.map(function(e){if(e.id!==id)return e;var n=Object.assign({},e);n[k]=v;return n;});});}
  function del(id){setItems(function(l){return l.filter(function(e){return e.id!==id;});});}
  var fi={background:C.inp,border:"1.5px solid "+C.border,borderRadius:6,padding:"6px 8px",fontSize:13,fontWeight:600,fontFamily:F,color:C.t1,outline:"none",width:"100%",boxSizing:"border-box"};
  return (
    <Sheet onClose={onClose}>
      <SheetHead title="LEFTOVER STOCK" onSave={function(){onUpdate(items);onClose();}} color={C.accent}/>
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{fontSize:10,color:C.t3,fontFamily:F,lineHeight:1.5,marginBottom:4}}>Track offcuts and leftover boards from completed jobs. The app will suggest using them in future projects.</div>
        {items.map(function(item){
          return (
            <div key={item.id} style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <input value={item.name} onChange={function(e){upd(item.id,"name",e.target.value);}} placeholder="Material name (e.g. Hardwood Oak)" style={Object.assign({},fi,{flex:1,marginRight:8,fontSize:12})}/>
                <button onClick={function(){del(item.id);}} style={{background:"none",border:"none",color:C.t4,cursor:"pointer",fontSize:16}}>✕</button>
              </div>
              <div className="grid-2" style={{gap:8,marginBottom:8}}>
                <div>
                  <div style={{fontSize:9,color:C.t3,fontFamily:F,marginBottom:4,letterSpacing:1}}>QTY / PIECES</div>
                  <input type="number" value={item.qty} onChange={function(e){upd(item.id,"qty",e.target.value);}} inputMode="numeric" style={fi}/>
                </div>
                <div>
                  <div style={{fontSize:9,color:C.t3,fontFamily:F,marginBottom:4,letterSpacing:1}}>SIZE (mm)</div>
                  <input value={item.size} onChange={function(e){upd(item.id,"size",e.target.value);}} placeholder="e.g. 120×800" style={fi}/>
                </div>
              </div>
              <input value={item.location} onChange={function(e){upd(item.id,"location",e.target.value);}} placeholder="Storage location (e.g. Workshop shelf A)" style={Object.assign({},fi,{fontSize:11})}/>
            </div>
          );
        })}
        <button onClick={add} style={{border:"2px dashed "+C.border,borderRadius:10,background:"transparent",padding:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer"}}>
          <span style={{fontSize:18,color:C.accent}}>＋</span>
          <span style={{fontSize:11,color:C.t3,fontFamily:F,letterSpacing:2}}>ADD STOCK ITEM</span>
        </button>
      </div>
    </Sheet>
  );
}

// ─── PROJECT DETAIL VIEW ──────────────────────────────────────────────────────
function ProjectDetail({project,boards,vinyls,stock,onUpdate,onBack}){
  var ps=useState(Object.assign({},project,{rooms:project.rooms?project.rooms.slice():[],wasteLog:project.wasteLog?project.wasteLog.slice():[],stock:project.stock?project.stock.slice():[]}));
  var proj=ps[0],setProj=ps[1];
  function updP(k,v){setProj(function(p){var n=Object.assign({},p);n[k]=v;return n;});}
  var ep=useState(null); var editRoom=ep[0],setEditRoom=ep[1];
  var sw=useState(false); var showWaste=sw[0],setShowWaste=sw[1];
  var ss=useState(false); var showStock=ss[0],setShowStock=ss[1];
  var st=useState("rooms"); var subTab=st[0],setSubTab=st[1];

  function addRoom(){
    var nr={id:uid(),name:"Room "+(proj.rooms.length+1),width:"",length:"",boardId:boards[0]?boards[0].id:null,vinylId:null};
    var updated=Object.assign({},proj,{rooms:proj.rooms.concat([nr])});
    setProj(updated); onUpdate(updated); setEditRoom(nr);
  }
  function saveRoom(updated){
    var newRooms=proj.rooms.map(function(r){return r.id===updated.id?updated:r;});
    var newProj=Object.assign({},proj,{rooms:newRooms});
    setProj(newProj); onUpdate(newProj);
    // AI learning: log room dimensions and board preference
    if(updated.width&&updated.length) aiLogRoomSize(updated.width, updated.length);
    if(updated.boardId) aiLogBoardChoice(updated.boardId);
  }
  function delRoom(id){
    var newProj=Object.assign({},proj,{rooms:proj.rooms.filter(function(r){return r.id!==id;})});
    setProj(newProj); onUpdate(newProj);
  }
  function saveWaste(log){
    var newProj=Object.assign({},proj,{wasteLog:log});
    setProj(newProj); onUpdate(newProj);
    // AI learning: calibrate installer fingerprint from completed waste data
    if(log.length>=3) aiCalibrateFromWasteLogs(log);
  }
  function saveStock(items){
    var newProj=Object.assign({},proj,{stock:items});
    setProj(newProj); onUpdate(newProj);
  }
  function saveAndBack(){onUpdate(proj);onBack();}

  var cardS={background:C.card,border:"2px solid "+C.cardB,borderRadius:12,padding:"14px",marginBottom:12,boxShadow:"3px 3px 0 "+C.cardB};
  var totalRooms=proj.rooms.filter(function(r){return r.width&&r.length;}).length;
  var totalBoards=proj.rooms.reduce(function(acc,r){
    if(!r.width||!r.length||!r.boardId)return acc;
    var b=boards.find(function(x){return x.id===r.boardId;});
    if(!b)return acc;
    var d=calcBoard(r,b); return acc+(d?Math.ceil(d.total*1.1):0);
  },0);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",background:C.bg,maxWidth:430,margin:"0 auto",overflow:"hidden"}}>
      <div style={{background:C.topbar,padding:"10px 16px",flexShrink:0,borderBottom:"3px solid "+C.accent,display:"flex",alignItems:"center",gap:12}}>
        <button onClick={saveAndBack} style={{background:"none",border:"none",color:C.accent,fontSize:18,cursor:"pointer",padding:"4px"}}>←</button>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:800,color:C.t1,fontFamily:F,letterSpacing:2}}>{proj.name.toUpperCase()}</div>
          <div style={{fontSize:9,color:C.t3,fontFamily:F,letterSpacing:2}}>{totalRooms} ROOM{totalRooms!==1?"S":""} · {totalBoards} BOARDS EST.</div>
        </div>
        <button onClick={function(){generatePDF(proj,boards,vinyls);}} style={{background:C.accent,border:"none",borderRadius:8,padding:"6px 12px",color:C.topbar,fontSize:10,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:1}}>PDF</button>
      </div>

      <div style={{display:"flex",background:C.topbar,borderBottom:"1px solid "+C.cardB,flexShrink:0}}>
        {[{id:"rooms",l:"ROOMS"},{id:"cuts",l:"CUTS"},{id:"waste",l:"WASTE"},{id:"stock",l:"STOCK"}].map(function(t){
          var act=subTab===t.id;
          return <button key={t.id} onClick={function(){setSubTab(t.id);}} style={{flex:1,padding:"8px 4px",background:"none",border:"none",borderBottom:"2px solid "+(act?C.accent:"transparent"),cursor:"pointer",fontSize:8,letterSpacing:2,color:act?C.accent:C.t3,fontFamily:F,fontWeight:act?700:400}}>{t.l}</button>;
        })}
      </div>

      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"14px 14px 6px"}}>

        {subTab==="rooms"&&(
          <div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9,color:C.t3,fontFamily:F,letterSpacing:2,marginBottom:6}}>CLIENT (optional)</div>
              <input value={proj.client||""} onChange={function(e){updP("client",e.target.value);}} placeholder="Client name" style={{background:C.inp,border:"2px solid "+C.border,borderRadius:8,padding:"10px 12px",fontSize:14,fontWeight:600,fontFamily:F,color:C.t1,outline:"none",width:"100%",boxSizing:"border-box"}}/>
            </div>
            {proj.rooms.map(function(room){
              var b=boards.find(function(x){return x.id===room.boardId;});
              var tex=b?WOOD_TEXTURES.find(function(t){return t.id===b.texture;}):null;
              var d=room.width&&room.length&&b?calcBoard(room,b):null;
              return (
                <div key={room.id} style={cardS}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {tex&&<div style={{width:36,height:36,background:tex.color,borderRadius:8,border:"2px solid "+tex.grain,flexShrink:0}}/>}
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F}}>{room.name}</div>
                      {room.width&&room.length?<div style={{fontSize:11,color:C.t3,fontFamily:F,marginTop:2}}>{room.width}m × {room.length}m · {(parseFloat(room.width)*parseFloat(room.length)).toFixed(2)}m²{d?" · "+d.total+" boards":""}</div>:<div style={{fontSize:11,color:C.t4,fontFamily:F,marginTop:2}}>No dimensions set</div>}
                    </div>
                    <button onClick={function(){setEditRoom(room);}} style={{background:C.cardB,border:"1.5px solid "+C.border,borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:F,cursor:"pointer",color:C.t2}}>EDIT</button>
                  </div>
                </div>
              );
            })}
            <button onClick={addRoom} style={{width:"100%",border:"2px dashed "+C.border,borderRadius:12,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:14,marginBottom:8}}>
              <span style={{fontSize:20,color:C.accent}}>＋</span>
              <span style={{fontSize:11,letterSpacing:2,fontWeight:700,color:C.t3,fontFamily:F}}>ADD ROOM</span>
            </button>
          </div>
        )}

        {subTab==="cuts"&&(
          <div>
            {proj.rooms.filter(function(r){return r.width&&r.length;}).map(function(room){
              var b=boards.find(function(x){return x.id===room.boardId;});
              if(!b)return null;
              return (
                <div key={room.id}>
                  <div style={{fontSize:10,letterSpacing:2,color:C.accent,marginBottom:8,fontWeight:700,fontFamily:F}}>{room.name.toUpperCase()} — {room.width}m × {room.length}m</div>
                  <AiPanel room={room} board={b} boards={boards} wasteLog={proj.wasteLog||[]} onSelectAlternative={function(){}}/>
                  <div style={cardS}>
                    <CuttingList room={room} board={b}/>
                  </div>
                </div>
              );
            })}
            {proj.rooms.filter(function(r){return r.width&&r.length;}).length===0&&(
              <div style={Object.assign({},cardS,{textAlign:"center",padding:"30px 20px"})}>
                <div style={{fontSize:30,marginBottom:10}}>✂️</div>
                <div style={{fontSize:12,color:C.t3,fontFamily:F}}>Add rooms with dimensions to see cutting lists</div>
              </div>
            )}
          </div>
        )}

        {subTab==="waste"&&(
          <div>
            <button onClick={function(){setShowWaste(true);}} style={{width:"100%",background:C.accent,border:"none",borderRadius:12,padding:"13px",color:C.topbar,fontSize:11,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:2,marginBottom:14}}>+ ADD / EDIT WASTE ENTRIES</button>
            {(proj.wasteLog||[]).length===0?(
              <div style={Object.assign({},cardS,{textAlign:"center",padding:"30px 20px"})}>
                <div style={{fontSize:30,marginBottom:10}}>📊</div>
                <div style={{fontSize:12,color:C.t3,fontFamily:F,lineHeight:1.6}}>Track actual boards used after each room. Builds accuracy for future quotes.</div>
              </div>
            ):(
              (proj.wasteLog||[]).map(function(w){
                var diff=parseFloat(w.actual||0)-parseFloat(w.estimated||0);
                return (
                  <div key={w.id} style={cardS}>
                    <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F,marginBottom:8}}>{w.roomName||"Unnamed Room"}</div>
                    <div style={{display:"flex",gap:8,marginBottom:6}}>
                      <Stat label="ESTIMATED" value={w.estimated}/>
                      <Stat label="ACTUAL" value={w.actual} accent={diff>0?C.red:C.okT}/>
                      <Stat label="DIFF" value={(diff>0?"+":"")+diff} accent={diff>0?C.red:diff<0?C.okT:C.t3}/>
                    </div>
                    {w.notes&&<div style={{fontSize:10,color:C.t3,fontFamily:F,fontStyle:"italic"}}>{w.notes}</div>}
                  </div>
                );
              })
            )}
          </div>
        )}

        {subTab==="stock"&&(
          <div>
            <button onClick={function(){setShowStock(true);}} style={{width:"100%",background:C.accent,border:"none",borderRadius:12,padding:"13px",color:C.topbar,fontSize:11,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:2,marginBottom:14}}>+ ADD / EDIT STOCK</button>
            {(proj.stock||[]).length===0?(
              <div style={Object.assign({},cardS,{textAlign:"center",padding:"30px 20px"})}>
                <div style={{fontSize:30,marginBottom:10}}>🗄️</div>
                <div style={{fontSize:12,color:C.t3,fontFamily:F,lineHeight:1.6}}>Log leftover boards and offcuts so you can reuse them in future jobs.</div>
              </div>
            ):(
              (proj.stock||[]).map(function(s){
                return (
                  <div key={s.id} style={cardS}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F}}>{s.name||"Unnamed"}</div>
                        <div style={{fontSize:11,color:C.t3,fontFamily:F,marginTop:2}}>{s.size} · {s.location}</div>
                      </div>
                      <div style={{fontSize:20,fontWeight:800,color:C.accent,fontFamily:F}}>×{s.qty}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {editRoom&&<RoomEditor room={editRoom} boards={boards} vinyls={vinyls} onUpdate={saveRoom} onClose={function(){setEditRoom(null);}} onDelete={function(){delRoom(editRoom.id);}}/>}
      {showWaste&&<WasteLogSheet project={proj} onUpdate={saveWaste} onClose={function(){setShowWaste(false);}}/>}
      {showStock&&<StockSheet stock={proj.stock||[]} onUpdate={saveStock} onClose={function(){setShowStock(false);}}/>}
    </div>
  );
}

// ─── CUTS PAGE ────────────────────────────────────────────────────────────────
function CutsPage({projects,boards,quickRoom,selB,can,cardS,obtnS,onGoProjects}){
  var roomsWithDims=[];
  projects.forEach(function(proj){
    (proj.rooms||[]).forEach(function(r){
      if(r.width&&r.length&&r.boardId){
        var b=boards.find(function(x){return x.id===r.boardId;});
        if(b) roomsWithDims.push({room:r,board:b,projName:proj.name});
      }
    });
  });
  if(roomsWithDims.length===0&&!can) return (
    <div style={Object.assign({},cardS,{textAlign:"center",padding:"36px 20px"})}>
      <div style={{fontSize:36,marginBottom:10}}>✂️</div>
      <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:8}}>No rooms with measurements</div>
      <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginBottom:16}}>Add rooms inside a Project, or enter quick calc dimensions on Home.</div>
      <button onClick={onGoProjects} style={obtnS}>GO TO PROJECTS →</button>
    </div>
  );
  return (
    <div>
      {roomsWithDims.map(function(item,i){
        return (
          <div key={i} style={cardS}>
            <div style={{fontSize:9,letterSpacing:2,color:C.accent,marginBottom:10,fontWeight:700,fontFamily:F}}>{item.projName.toUpperCase()} — {item.room.name.toUpperCase()} · {item.room.width}×{item.room.length}m</div>
            <CuttingList room={item.room} board={item.board}/>
          </div>
        );
      })}
      {can&&selB&&(
        <div style={cardS}>
          <div style={{fontSize:9,letterSpacing:2,color:C.t3,marginBottom:10,fontWeight:700,fontFamily:F}}>QUICK CALC ROOM</div>
          <CuttingList room={quickRoom} board={selB}/>
        </div>
      )}
    </div>
  );
}

// ─── WASTE PAGE ───────────────────────────────────────────────────────────────
function WastePage({projects,cardS,obtnS,onGoProjects}){
  var allEntries=[];
  projects.forEach(function(proj){
    (proj.wasteLog||[]).forEach(function(w){
      allEntries.push(Object.assign({},w,{projName:proj.name}));
    });
  });
  if(allEntries.length===0) return (
    <div style={Object.assign({},cardS,{textAlign:"center",padding:"36px 20px"})}>
      <div style={{fontSize:36,marginBottom:10}}>📊</div>
      <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:8}}>No waste entries yet</div>
      <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginBottom:16}}>Open a project and use the Waste tab to log actual boards used.</div>
      <button onClick={onGoProjects} style={obtnS}>GO TO PROJECTS →</button>
    </div>
  );
  var totalOver=allEntries.reduce(function(a,w){var d=parseFloat(w.actual||0)-parseFloat(w.estimated||0);return d>0?a+d:a;},0);
  var totalUnder=allEntries.reduce(function(a,w){var d=parseFloat(w.actual||0)-parseFloat(w.estimated||0);return d<0?a+Math.abs(d):a;},0);
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <div style={{flex:1,background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px",textAlign:"center"}}>
          <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:3}}>ENTRIES</div>
          <div style={{fontSize:20,fontWeight:800,color:C.accent,fontFamily:F}}>{allEntries.length}</div>
        </div>
        <div style={{flex:1,background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px",textAlign:"center"}}>
          <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:3}}>OVER</div>
          <div style={{fontSize:20,fontWeight:800,color:totalOver>0?C.red:C.okT,fontFamily:F}}>{totalOver>0?"+"+totalOver:0}</div>
        </div>
        <div style={{flex:1,background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px",textAlign:"center"}}>
          <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:3}}>UNDER</div>
          <div style={{fontSize:20,fontWeight:800,color:C.okT,fontFamily:F}}>{totalUnder>0?"-"+totalUnder:0}</div>
        </div>
      </div>
      {allEntries.map(function(w,i){
        var diff=parseFloat(w.actual||0)-parseFloat(w.estimated||0);
        return (
          <div key={i} style={cardS}>
            <div style={{fontSize:9,color:C.t4,fontFamily:F,letterSpacing:1,marginBottom:4}}>{w.projName}</div>
            <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F,marginBottom:8}}>{w.roomName||"Unnamed Room"}</div>
            <div style={{display:"flex",gap:8,marginBottom:w.notes?6:0}}>
              <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:C.t3,letterSpacing:1,fontFamily:F,marginBottom:2}}>EST.</div>
                <div style={{fontSize:16,fontWeight:800,color:C.t1,fontFamily:F}}>{w.estimated}</div>
              </div>
              <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:C.t3,letterSpacing:1,fontFamily:F,marginBottom:2}}>ACTUAL</div>
                <div style={{fontSize:16,fontWeight:800,color:diff>0?C.red:C.okT,fontFamily:F}}>{w.actual}</div>
              </div>
              <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:C.t3,letterSpacing:1,fontFamily:F,marginBottom:2}}>DIFF</div>
                <div style={{fontSize:16,fontWeight:800,color:diff>0?C.red:diff<0?C.okT:C.t3,fontFamily:F}}>{diff>0?"+"+diff:diff}</div>
              </div>
            </div>
            {w.notes&&<div style={{fontSize:10,color:C.t3,fontFamily:F,fontStyle:"italic",marginTop:4}}>{w.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── STOCK PAGE ───────────────────────────────────────────────────────────────
function StockPage({projects,cardS,obtnS,onGoProjects}){
  var allStock=[];
  projects.forEach(function(proj){
    (proj.stock||[]).forEach(function(s){
      allStock.push(Object.assign({},s,{projName:proj.name}));
    });
  });
  if(allStock.length===0) return (
    <div style={Object.assign({},cardS,{textAlign:"center",padding:"36px 20px"})}>
      <div style={{fontSize:36,marginBottom:10}}>🗄️</div>
      <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:8}}>No stock logged yet</div>
      <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginBottom:16}}>Open a project and use the Stock tab to log leftover boards and offcuts.</div>
      <button onClick={onGoProjects} style={obtnS}>GO TO PROJECTS →</button>
    </div>
  );
  return (
    <div>
      <div style={{background:C.statBg,border:"1.5px solid "+C.border,borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,color:C.t3,fontFamily:F,letterSpacing:2}}>TOTAL ITEMS IN STOCK</span>
        <span style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:F}}>{allStock.length}</span>
      </div>
      {allStock.map(function(s,i){
        return (
          <div key={i} style={cardS}>
            <div style={{fontSize:9,color:C.t4,fontFamily:F,letterSpacing:1,marginBottom:4}}>{s.projName}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F}}>{s.name||"Unnamed"}</div>
                <div style={{fontSize:11,color:C.t3,fontFamily:F,marginTop:2}}>{s.size?s.size+" · ":""}{s.location}</div>
              </div>
              <div style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:F}}>×{s.qty}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AI PROFILE PANEL ─────────────────────────────────────────────────────────
function AiProfilePanel() {
  var profile = aiGetInstallerProfile();
  var jobsDone = profile.jobsAnalysed || 0;
  var calibration = profile.calibrationFactor || 0;
  var choiceOverrides = (profile.choiceLog || []).filter(function(c){ return c.override; }).length;
  var totalChoices = (profile.choiceLog || []).length;
  var overrideRate = totalChoices > 0 ? Math.round((choiceOverrides / totalChoices) * 100) : 0;
  var prefBoards = Object.entries(profile.boardUsageCount || {}).sort(function(a,b){ return b[1]-a[1]; });
  var topBoardId = prefBoards.length > 0 ? prefBoards[0][0] : null;

  var progress = Math.min(100, Math.round((jobsDone / 10) * 100));

  return (
    <div style={{marginTop:14,background:"#141E0C",border:"2px solid "+C.accent,borderRadius:12,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>◈</span>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:C.accent,fontFamily:F,letterSpacing:3}}>INSTALLER FINGERPRINT</div>
          <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:1}}>AI personalisation — improves with every job</div>
        </div>
      </div>

      {/* Learning progress bar */}
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:9,color:C.t3,fontFamily:F,letterSpacing:1}}>CALIBRATION PROGRESS</span>
          <span style={{fontSize:9,color:C.accent,fontFamily:F,fontWeight:700}}>{jobsDone}/10 jobs</span>
        </div>
        <div style={{background:C.cardB,borderRadius:4,height:6,overflow:"hidden"}}>
          <div style={{background:C.accent,height:"100%",width:progress+"%",borderRadius:4,transition:"width 0.3s"}}/>
        </div>
        {jobsDone < 3 && (
          <div style={{fontSize:9,color:C.t4,fontFamily:F,marginTop:4}}>
            Complete {3-jobsDone} more job{3-jobsDone!==1?"s":""} in Waste Tracker to unlock personalised order quantities.
          </div>
        )}
      </div>

      {jobsDone >= 3 ? (
        <div>
          <div className="grid-2" style={{gap:8,marginBottom:10}}>
            <div style={{background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:C.t4,letterSpacing:1,fontFamily:F,marginBottom:2}}>AVG OVERRUN</div>
              <div style={{fontSize:16,fontWeight:800,color:calibration>0?C.warnT:C.okT,fontFamily:F}}>
                {calibration>0?"+":""}{calibration.toFixed(1)} boards
              </div>
            </div>
            <div style={{background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:8,color:C.t4,letterSpacing:1,fontFamily:F,marginBottom:2}}>AI OVERRIDES</div>
              <div style={{fontSize:16,fontWeight:800,color:overrideRate>30?C.warnT:C.okT,fontFamily:F}}>{overrideRate}%</div>
            </div>
          </div>
          <div style={{fontSize:11,color:C.t3,fontFamily:F,lineHeight:1.5}}>
            {calibration > 2
              ? "You consistently use more boards than estimated. AI is automatically adding "+calibration.toFixed(1)+" boards to all future recommendations."
              : calibration < -1
              ? "You are consistently under estimate — AI has adjusted order quantities down by "+Math.abs(calibration).toFixed(1)+" boards."
              : "Your estimates are well-calibrated. AI recommendations closely match your actual usage."}
          </div>
          {overrideRate > 40 && (
            <div style={{marginTop:8,background:C.warn,borderRadius:8,padding:"8px 10px",fontSize:10,color:C.warnT,fontFamily:F}}>
              ⚠️ You override AI layouts frequently ({overrideRate}% of the time). Your preferred settings are being learned automatically.
            </div>
          )}
        </div>
      ) : (
        <div style={{fontSize:11,color:C.t4,fontFamily:F,lineHeight:1.6}}>
          The AI fingerprint learns your installation style — how much material you actually use, which offsets you prefer, and your most-used boards. The more jobs you log, the more accurate your personalised recommendations become.
        </div>
      )}
    </div>
  );
}

// ─── MENU SCREEN ──────────────────────────────────────────────────────────────
function MenuScreen({onNav,projects,boards,vinyls,stock}){
  var totalRooms=projects.reduce(function(a,p){return a+(p.rooms?p.rooms.filter(function(r){return r.width&&r.length;}).length:0);},0);
  var totalBoards=projects.reduce(function(acc,proj){
    return acc+(proj.rooms||[]).reduce(function(a,r){
      if(!r.width||!r.length||!r.boardId)return a;
      var b=boards.find(function(x){return x.id===r.boardId;});
      var d=b?calcBoard(r,b):null; return a+(d?d.total:0);
    },0);
  },0);
  var totalStock=projects.reduce(function(a,p){return a+(p.stock?p.stock.length:0);},0);
  var totalWaste=projects.reduce(function(a,p){return a+(p.wasteLog?p.wasteLog.length:0);},0);

  var sections=[
    {id:"projects", icon:"🏗️", label:"Projects",      sub:"Manage jobs & rooms",        badge:projects.length,       color:C.accent,    dim:C.accentDim},
    {id:"calc",     icon:"📐", label:"Quick Calc",     sub:"Fast one-off measurement",   badge:null,                  color:"#7A9A4A",   dim:"#5A7A2A"},
    {id:"cuts",     icon:"✂️", label:"Cutting List",   sub:"Cut sizes across all rooms", badge:totalRooms>0?totalRooms:null, color:"#8A7A2A",dim:"#6A5A1A"},
    {id:"waste",    icon:"📊", label:"Waste Tracker",  sub:"Estimated vs actual used",   badge:totalWaste||null,      color:"#5A8A6A",   dim:"#3A6A4A"},
    {id:"stock",    icon:"🗄️", label:"Leftover Stock", sub:"Offcuts & surplus boards",   badge:totalStock||null,      color:"#6A7A3A",   dim:"#4A5A1A"},
    {id:"materials",icon:"🎨", label:"Materials",      sub:"Boards & vinyl roll library", badge:boards.length+vinyls.length, color:"#7A6A4A",dim:"#5A4A2A"},
    {id:"results",  icon:"📈", label:"Results",        sub:"Layout visualisation",       badge:null,                  color:"#4A7A5A",   dim:"#2A5A3A"},
  ];

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px 14px 8px"}}>
      <div style={{fontSize:10,letterSpacing:3,color:C.t3,fontWeight:700,marginBottom:14,fontFamily:F}}>ALL FEATURES</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {sections.map(function(s){
          return (
            <button key={s.id} onClick={function(){onNav(s.id);}}
              style={{background:C.card,border:"2px solid "+C.cardB,borderRadius:14,padding:"0",cursor:"pointer",display:"flex",alignItems:"stretch",overflow:"hidden",boxShadow:"3px 3px 0 "+C.cardB,textAlign:"left",width:"100%"}}>
              <div style={{width:6,background:s.color,flexShrink:0}}/>
              <div style={{padding:"14px 14px",flex:1,display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:44,height:44,borderRadius:10,background:s.dim+"33",border:"1.5px solid "+s.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{s.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.t1,fontFamily:F,letterSpacing:1}}>{s.label}</div>
                  <div style={{fontSize:10,color:C.t3,fontFamily:F,marginTop:3}}>{s.sub}</div>
                </div>
                {s.badge!==null&&s.badge!==undefined&&(
                  <div style={{background:s.color,borderRadius:20,minWidth:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 8px",flexShrink:0}}>
                    <span style={{fontSize:11,fontWeight:800,color:C.topbar,fontFamily:F}}>{s.badge}</span>
                  </div>
                )}
                <div style={{fontSize:16,color:C.t4,flexShrink:0}}>›</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{marginTop:20,background:C.topbar,borderRadius:12,padding:"14px 16px"}}>
        <div style={{fontSize:9,letterSpacing:3,color:C.t3,fontFamily:F,marginBottom:10,fontWeight:700}}>APP STATS</div>
        <div className="grid-3" style={{gap:8}}>
          {[["Projects",""+projects.length],["Rooms",""+totalRooms],["Boards",""+boards.length],["Vinyls",""+vinyls.length],["Stock",""+totalStock],["Waste Logs",""+totalWaste]].map(function(pair){
            return (
              <div key={pair[0]} style={{background:C.card,borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:C.t4,letterSpacing:1,fontFamily:F,marginBottom:2}}>{pair[0]}</div>
                <div style={{fontSize:18,fontWeight:800,color:C.accent,fontFamily:F}}>{pair[1]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <AiProfilePanel/>

      <div style={{height:10}}/>
    </div>
  );
}

// ─── QUICK STATS (iOS-safe sub-component) ─────────────────────────────────────
function QuickStats({room, board, show}){
  if(!show) return null;
  var d = calcBoard(room, board);
  if(!d) return null;
  return (
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
        <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:2}}>BOARDS</div>
        <div style={{fontSize:18,fontWeight:800,color:C.accent,fontFamily:F}}>{d.total}</div>
      </div>
      <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
        <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:2}}>CUTS</div>
        <div style={{fontSize:18,fontWeight:800,color:d.cuts>0?C.red:C.okT,fontFamily:F}}>{d.cuts}</div>
      </div>
      <div style={{flex:1,background:C.statBg,borderRadius:8,padding:"8px",textAlign:"center"}}>
        <div style={{fontSize:8,color:C.t3,letterSpacing:2,fontFamily:F,marginBottom:2}}>WASTE</div>
        <div style={{fontSize:18,fontWeight:800,color:d.waste>15?C.red:C.okT,fontFamily:F}}>{d.waste.toFixed(0)}%</div>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
function HomeScreen({projects,boards,vinyls,onNav,onOpenProject,onNewProject,quickRoom,setQuickRoom,selB,selV,btex,vcol}){
  var can=!!(quickRoom.width&&quickRoom.length&&parseFloat(quickRoom.width)>0&&parseFloat(quickRoom.length)>0);
  var recentProjects=projects.slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);}).slice(0,3);
  var totalBoards=projects.reduce(function(acc,proj){
    return acc+(proj.rooms||[]).reduce(function(a,r){
      if(!r.width||!r.length||!r.boardId)return a;
      var b=boards.find(function(x){return x.id===r.boardId;});
      var d=b?calcBoard(r,b):null; return a+(d?d.total:0);
    },0);
  },0);
  var cardS={background:C.card,border:"2px solid "+C.cardB,borderRadius:12,padding:"14px",marginBottom:12,boxShadow:"3px 3px 0 "+C.cardB};
  var inpS={background:C.inp,border:"2px solid "+C.border,borderRadius:8,padding:"11px 14px",fontSize:17,fontWeight:700,color:C.t1,width:"100%",fontFamily:F,outline:"none",boxSizing:"border-box"};
  var obtnS={width:"100%",padding:"13px",background:C.accent,border:"2px solid "+C.accentDim,borderRadius:11,color:C.topbar,fontSize:11,letterSpacing:3,fontWeight:800,cursor:"pointer",fontFamily:F,boxShadow:"3px 3px 0 "+C.accentDim};

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"14px 14px 6px"}}>

      {/* ── QUICK CALC ── */}
      <div style={cardS}>
        <div style={{fontSize:9,letterSpacing:3,color:C.accent,marginBottom:12,fontWeight:700,fontFamily:F}}>⚡ QUICK CALC</div>
        <div className="grid-2" style={{gap:10,marginBottom:12}}>
          <div>
            <div style={{fontSize:9,letterSpacing:2,color:C.t3,marginBottom:5,fontWeight:700,fontFamily:F}}>WIDTH (m)</div>
            <input style={inpS} type="number" min="0.1" step="0.01" value={quickRoom.width} onChange={function(e){setQuickRoom(function(r){return Object.assign({},r,{width:e.target.value});});}} placeholder="4.50" inputMode="decimal"/>
          </div>
          <div>
            <div style={{fontSize:9,letterSpacing:2,color:C.t3,marginBottom:5,fontWeight:700,fontFamily:F}}>LENGTH (m)</div>
            <input style={inpS} type="number" min="0.1" step="0.01" value={quickRoom.length} onChange={function(e){setQuickRoom(function(r){return Object.assign({},r,{length:e.target.value});});}} placeholder="6.20" inputMode="decimal"/>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.topbar,borderRadius:8,padding:"10px 14px",marginBottom:can?10:0}}>
          <span style={{fontSize:9,letterSpacing:2,color:C.t3,fontFamily:F}}>AREA</span>
          <span style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:F}}>{can?(parseFloat(quickRoom.width)*parseFloat(quickRoom.length)).toFixed(2)+" m²":"— m²"}</span>
        </div>
        <AiValidationBanner room={quickRoom}/>
        {can&&selB&&<AiQuickBar room={quickRoom} board={selB}/>}
        <QuickStats room={quickRoom} board={selB} show={can&&!!selB}/>
        {can&&(
          <div style={{display:"flex",gap:8}}>
            <button style={Object.assign({},obtnS,{flex:1,padding:"11px 8px",fontSize:10})} onClick={function(){onNav("results");}}>🪵 BOARDS →</button>
            <button style={{flex:1,padding:"11px 8px",background:C.vinyl,border:"2px solid "+C.vinylDim,borderRadius:11,color:"#FFF",fontSize:10,letterSpacing:2,fontWeight:800,cursor:"pointer",fontFamily:F,boxShadow:"3px 3px 0 "+C.vinylDim}} onClick={function(){onNav("results_vinyl");}}>🎞 VINYL →</button>
          </div>
        )}
      </div>

      {/* ── RECENT PROJECTS ── */}
      <div style={cardS}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:9,letterSpacing:3,color:C.accent,fontWeight:700,fontFamily:F}}>🏗️ RECENT PROJECTS</div>
          <button onClick={onNewProject} style={{background:C.accent,border:"none",borderRadius:7,padding:"5px 12px",color:C.topbar,fontSize:10,fontWeight:800,fontFamily:F,cursor:"pointer"}}>＋ NEW</button>
        </div>
        {recentProjects.length===0?(
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{fontSize:11,color:C.t4,fontFamily:F,lineHeight:1.6}}>No projects yet. Create one to group rooms, track waste and generate quotes.</div>
            <button onClick={onNewProject} style={Object.assign({},obtnS,{marginTop:12})}>＋ CREATE PROJECT</button>
          </div>
        ):(
          recentProjects.map(function(proj){
            var rc=(proj.rooms||[]).filter(function(r){return r.width&&r.length;}).length;
            var tb=(proj.rooms||[]).reduce(function(acc,r){
              if(!r.width||!r.length||!r.boardId)return acc;
              var b=boards.find(function(x){return x.id===r.boardId;});
              var d=b?calcBoard(r,b):null; return acc+(d?d.total:0);
            },0);
            return (
              <div key={proj.id} onClick={function(){onOpenProject(proj);}} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid "+C.cardB,cursor:"pointer"}}>
                <div style={{width:36,height:36,background:C.accent+"22",border:"1.5px solid "+C.accent+"55",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏗️</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.t1,fontFamily:F}}>{proj.name}</div>
                  <div style={{fontSize:10,color:C.t4,fontFamily:F,marginTop:2}}>{rc} room{rc!==1?"s":""} · {tb} boards</div>
                </div>
                <div style={{fontSize:18,color:C.t4}}>›</div>
              </div>
            );
          })
        )}
        {projects.length>3&&(
          <button onClick={function(){onNav("projects");}} style={{width:"100%",padding:"10px",background:"transparent",border:"1.5px dashed "+C.border,borderRadius:8,color:C.t3,fontSize:10,fontWeight:700,fontFamily:F,cursor:"pointer",marginTop:8,letterSpacing:2}}>VIEW ALL {projects.length} PROJECTS →</button>
        )}
      </div>

      {/* ── ACTIVE MATERIALS ── */}
      <div style={cardS}>
        <div style={{fontSize:9,letterSpacing:3,color:C.accent,marginBottom:12,fontWeight:700,fontFamily:F}}>🎨 ACTIVE MATERIALS</div>
        {selB&&(
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:selV?10:0}}>
            <div style={{width:36,height:36,background:btex?btex.color:"#888",borderRadius:8,border:"2px solid "+(btex?btex.grain:"#666"),flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:C.t1,fontFamily:F}}>{selB.name}</div>
              <div style={{fontSize:10,color:C.t3,fontFamily:F}}>{selB.widthMm}×{selB.lengthMm}mm</div>
            </div>
            <button onClick={function(){onNav("materials");}} style={{background:C.inp,border:"1.5px solid "+C.border,borderRadius:7,padding:"5px 10px",fontSize:9,fontWeight:700,fontFamily:F,cursor:"pointer",color:C.t2,letterSpacing:1}}>CHANGE</button>
          </div>
        )}
        {selV&&(
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,background:vcol?vcol.color:"#888",borderRadius:8,border:"2px solid "+(vcol?vcol.stripe:"#666"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎞</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:C.t1,fontFamily:F}}>{selV.name}</div>
              <div style={{fontSize:10,color:C.vinylText,fontFamily:F}}>{selV.rollWidthMm}mm × {selV.rollLengthM}m</div>
            </div>
            <button onClick={function(){onNav("materials");}} style={{background:C.inp,border:"1.5px solid "+C.vinylDim,borderRadius:7,padding:"5px 10px",fontSize:9,fontWeight:700,fontFamily:F,cursor:"pointer",color:C.vinylText,letterSpacing:1}}>CHANGE</button>
          </div>
        )}
      </div>

      {/* ── SHORTCUT GRID ── */}
      <div style={{fontSize:9,letterSpacing:3,color:C.t3,fontWeight:700,fontFamily:F,marginBottom:10}}>QUICK ACCESS</div>
      <div className="grid-2" style={{marginBottom:16}}>
        {[
          {icon:"✂️", label:"Cutting List",  sub:"Batch cut sizes",    id:"cuts",   color:C.accent},
          {icon:"📊", label:"Waste Tracker", sub:"Log actual usage",   id:"waste",  color:"#5A8A6A"},
          {icon:"🗄️", label:"Leftover Stock",sub:"Track offcuts",      id:"stock",  color:"#6A7A3A"},
          {icon:"📄", label:"PDF Quote",     sub:"Open a project",     id:"projects",color:C.vinyl},
        ].map(function(item){
          return (
            <button key={item.id} onClick={function(){onNav(item.id);}} style={{background:C.card,border:"2px solid "+C.cardB,borderRadius:12,padding:"14px 12px",cursor:"pointer",textAlign:"left",boxShadow:"3px 3px 0 "+C.cardB}}>
              <div style={{fontSize:24,marginBottom:8}}>{item.icon}</div>
              <div style={{fontSize:12,fontWeight:800,color:C.t1,fontFamily:F,marginBottom:3}}>{item.label}</div>
              <div style={{fontSize:9,color:C.t4,fontFamily:F}}>{item.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  var s1=useState(false);    var loaded=s1[0],setLoaded=s1[1];
  var s2=useState("home");   var tab=s2[0],setTab=s2[1];
  var s3=useState(SEED_BOARDS); var boards=s3[0],setBoards=s3[1];
  var s4=useState("b1");    var selBid=s4[0],setSelBid=s4[1];
  var s5=useState(SEED_VINYLS); var vinyls=s5[0],setVinyls=s5[1];
  var s6=useState("v1");    var selVid=s6[0],setSelVid=s6[1];
  var s7=useState([]);      var projects=s7[0],setProjects=s7[1];
  var s8=useState(null);    var openProj=s8[0],setOpenProj=s8[1];
  var s9=useState(null);    var editBoard=s9[0],setEditBoard=s9[1];
  var s10=useState(null);   var editVinyl=s10[0],setEditVinyl=s10[1];
  var s11=useState({name:"",width:"",length:""}); var quickRoom=s11[0],setQuickRoom=s11[1];
  var s12=useState("boards"); var resMode=s12[0],setResMode=s12[1];

  useEffect(function(){
    var sb=sGet(SK.boards), sv=sGet(SK.vinyls), sp=sGet(SK.projects);
    if(sb&&sb.length>0){setBoards(sb);setSelBid(sb[0].id);}
    if(sv&&sv.length>0){setVinyls(sv);setSelVid(sv[0].id);}
    if(sp)setProjects(sp);
    setLoaded(true);
  },[]);
  useEffect(function(){if(loaded)sSet(SK.boards,boards);},[boards,loaded]);
  useEffect(function(){if(loaded)sSet(SK.vinyls,vinyls);},[vinyls,loaded]);
  useEffect(function(){if(loaded)sSet(SK.projects,projects);},[projects,loaded]);

  var selB=boards.find(function(b){return b.id===selBid;})||boards[0];
  var selV=vinyls.find(function(v){return v.id===selVid;})||vinyls[0];
  var can=!!(quickRoom.width&&quickRoom.length&&parseFloat(quickRoom.width)>0&&parseFloat(quickRoom.length)>0);

  function addBoard(){var n={id:uid(),name:"New Board",widthMm:120,lengthMm:1200,texture:"pine"};setBoards(function(p){return p.concat([n]);});setSelBid(n.id);setEditBoard(n);}
  function saveBoard(u){setBoards(function(p){return p.map(function(b){return b.id===u.id?u:b;});});}
  function delBoard(id){setBoards(function(p){var n=p.filter(function(b){return b.id!==id;});if(selBid===id)setSelBid(n[0]?n[0].id:"");return n;});}
  function addVinyl(){var n={id:uid(),name:"New Vinyl",rollWidthMm:2000,rollLengthM:20,fixedWidth:false,color:"stone_grey"};setVinyls(function(p){return p.concat([n]);});setSelVid(n.id);setEditVinyl(n);}
  function saveVinyl(u){setVinyls(function(p){return p.map(function(v){return v.id===u.id?u:v;});});}
  function delVinyl(id){setVinyls(function(p){var n=p.filter(function(v){return v.id!==id;});if(selVid===id)setSelVid(n[0]?n[0].id:"");return n;});}

  function addProject(){
    var np={id:uid(),name:"New Project",client:"",createdAt:Date.now(),rooms:[],wasteLog:[],stock:[]};
    setProjects(function(p){return p.concat([np]);});
    setOpenProj(np);
  }
  function updateProject(updated){setProjects(function(p){return p.map(function(x){return x.id===updated.id?updated:x;});});}
  function deleteProject(id){setProjects(function(p){return p.filter(function(x){return x.id!==id;});});}

  var btex=WOOD_TEXTURES.find(function(t){return t.id===(selB&&selB.texture);});
  var vcol=VINYL_COLORS.find(function(c){return c.id===(selV&&selV.color);});

  var cardS={background:C.card,border:"2px solid "+C.cardB,borderRadius:12,padding:"14px",marginBottom:12,boxShadow:"3px 3px 0 "+C.cardB};
  var vcardS={background:"#1A2C1A",border:"2px solid "+C.vinylDim,borderRadius:12,padding:"14px",marginBottom:12,boxShadow:"3px 3px 0 "+C.vinylDim};
  var inpS={background:C.inp,border:"2px solid "+C.border,borderRadius:8,padding:"12px 14px",fontSize:18,fontWeight:700,color:C.t1,width:"100%",fontFamily:F,outline:"none",boxSizing:"border-box"};
  var obtnS={width:"100%",padding:"14px",background:C.accent,border:"2px solid "+C.accentDim,borderRadius:12,color:C.topbar,fontSize:11,letterSpacing:3,fontWeight:800,cursor:"pointer",fontFamily:F,boxShadow:"3px 3px 0 "+C.accentDim};
  var vbtnS={width:"100%",padding:"14px",background:C.vinyl,border:"2px solid "+C.vinylDim,borderRadius:12,color:"#FFF",fontSize:11,letterSpacing:3,fontWeight:800,cursor:"pointer",fontFamily:F,boxShadow:"3px 3px 0 "+C.vinylDim};

  // Navigate from menu/home to a feature section
  function navTo(id){
    if(id==="results_vinyl"){setResMode("vinyl"); setTab("results"); return;}
    if(id==="results")      {setResMode("boards");setTab("results"); return;}
    if(id==="cuts")         {setTab("cuts");  return;}
    if(id==="waste")        {setTab("waste"); return;}
    if(id==="stock")        {setTab("stock"); return;}
    setTab(id);
  }

  if(!loaded){return <div style={{display:"flex",flexDirection:"column",height:"100dvh",background:C.bg,alignItems:"center",justifyContent:"center",gap:12}}><div style={{fontSize:32,color:C.accent}}>◈</div><div style={{fontSize:11,letterSpacing:3,color:C.t3,fontFamily:F}}>LOADING...</div></div>;}
  if(openProj){return <ProjectDetail project={openProj} boards={boards} vinyls={vinyls} stock={[]} onUpdate={updateProject} onBack={function(){setOpenProj(null); setTab("projects");}}/>;}

  // ── Determine page title and back button for inner pages ──────────────────
  var innerTabs=["projects","materials","results","cuts","waste","stock"];
  var isInner=innerTabs.indexOf(tab)!==-1;
  var pageTitles={projects:"PROJECTS",materials:"MATERIALS",results:"RESULTS",cuts:"CUTTING LIST",waste:"WASTE TRACKER",stock:"LEFTOVER STOCK"};

  return (
    <div className="app-shell" style={{height:"100dvh",background:C.bg}}>

      {/* TOP BAR */}
      <div className="top-bar" style={{background:C.topbar,flexShrink:0,borderBottom:"3px solid "+C.accent,display:"flex",alignItems:"center",gap:12}}>
        {isInner?(
          <button onClick={function(){setTab("home");}} style={{background:"none",border:"none",color:C.accent,fontSize:20,cursor:"pointer",padding:"2px 6px",lineHeight:1}}>‹</button>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:18,color:C.accent}}>◈</div>
            <div className="brand-text">
              <div style={{fontSize:16,fontWeight:800,color:C.accent,letterSpacing:3}}>FLOOR CULC</div>
              <div style={{fontSize:8,color:C.t3,letterSpacing:3,marginTop:1}}>FLOOR LAYOUT CALCULATOR</div>
            </div>
          </div>
        )}
        <div style={{flex:1}}>
          {isInner?(
            <div style={{fontSize:14,fontWeight:800,color:C.t1,letterSpacing:2}}>{pageTitles[tab]||tab.toUpperCase()}</div>
          ):(
            <div>
              <div style={{fontSize:16,fontWeight:800,color:C.accent,letterSpacing:3}}>FLOOR CULC</div>
              <div style={{fontSize:8,color:C.t3,letterSpacing:3,marginTop:1}}>FLOOR LAYOUT CALCULATOR</div>
            </div>
          )}
        </div>
        {tab==="home"&&<div style={{fontSize:9,color:C.t4,fontFamily:F,letterSpacing:1}}>{projects.length} project{projects.length!==1?"s":""}</div>}
      </div>

      <div className="main-body" style={{display:"flex",minHeight:0}}>
        <aside className="desktop-nav">
          <MenuScreen onNav={function(id){navTo(id); setTab(id==="results_vinyl"?"results":id);}} projects={projects} boards={boards} vinyls={vinyls} stock={[]}/>
        </aside>

      {/* CONTENT */}
      <div className="page-content" style={{flex:1}}>

        {/* ── HOME ── */}
        {tab==="home"&&(
          <HomeScreen
            projects={projects} boards={boards} vinyls={vinyls}
            onNav={navTo} onOpenProject={setOpenProj} onNewProject={addProject}
            quickRoom={quickRoom} setQuickRoom={setQuickRoom}
            selB={selB} selV={selV} btex={btex} vcol={vcol}
          />
        )}

        {/* ── PROJECTS ── */}
        {tab==="projects"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:10,letterSpacing:2,color:C.t3,fontWeight:700}}>ALL PROJECTS</div>
              <button onClick={addProject} style={{background:C.accent,border:"none",borderRadius:8,padding:"6px 14px",color:C.topbar,fontSize:10,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:1}}>＋ NEW</button>
            </div>
            {projects.length===0&&(
              <div style={Object.assign({},cardS,{textAlign:"center",padding:"40px 20px"})}>
                <div style={{fontSize:40,marginBottom:12}}>🏗️</div>
                <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:8}}>No projects yet</div>
                <div style={{fontSize:11,color:C.t3,lineHeight:1.6,marginBottom:20}}>Group rooms, track waste, manage stock and generate PDF quotes.</div>
                <button onClick={addProject} style={obtnS}>＋ CREATE FIRST PROJECT</button>
              </div>
            )}
            {projects.slice().reverse().map(function(proj){
              var roomCount=(proj.rooms||[]).filter(function(r){return r.width&&r.length;}).length;
              var totalB=(proj.rooms||[]).reduce(function(acc,r){
                if(!r.width||!r.length||!r.boardId)return acc;
                var b=boards.find(function(x){return x.id===r.boardId;});
                var d=b?calcBoard(r,b):null; return acc+(d?d.total:0);
              },0);
              var dt=new Date(proj.createdAt||Date.now());
              return (
                <div key={proj.id} style={cardS}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}} onClick={function(){setOpenProj(proj);}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.t1}}>{proj.name}</div>
                      {proj.client&&<div style={{fontSize:11,color:C.t3,marginTop:1}}>Client: {proj.client}</div>}
                      <div style={{fontSize:10,color:C.t4,marginTop:3}}>{roomCount} room{roomCount!==1?"s":""} · {totalB} boards · {dt.toLocaleDateString()}</div>
                    </div>
                    <button onClick={function(){setOpenProj(proj);}} style={{background:C.accent,border:"none",borderRadius:8,padding:"7px 14px",fontSize:10,fontWeight:800,fontFamily:F,color:C.topbar,cursor:"pointer"}}>OPEN</button>
                    <button onClick={function(){if(window.confirm("Delete "+proj.name+"?"))deleteProject(proj.id);}} style={{background:C.redBg,border:"1.5px solid "+C.redBorder,borderRadius:8,padding:"7px 10px",fontSize:12,cursor:"pointer",color:"#E07070"}}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CUTS (standalone) ── */}
        {tab==="cuts"&&(
          <div>
            <CutsPage projects={projects} boards={boards} quickRoom={quickRoom} selB={selB} can={can} cardS={cardS} obtnS={obtnS} onGoProjects={function(){setTab("projects");}}/>
          </div>
        )}

        {/* ── WASTE TRACKER (standalone) ── */}
        {tab==="waste"&&(
          <div>
            <WastePage projects={projects} cardS={cardS} obtnS={obtnS} onGoProjects={function(){setTab("projects");}}/>
          </div>
        )}

        {/* ── LEFTOVER STOCK (standalone) ── */}
        {tab==="stock"&&(
          <div>
            <StockPage projects={projects} cardS={cardS} obtnS={obtnS} onGoProjects={function(){setTab("projects");}}/>
          </div>
        )}

        {/* ── MATERIALS ── */}
        {tab==="materials"&&(
          <div>
            <div style={{fontSize:10,letterSpacing:2,color:C.accent,marginBottom:8,fontWeight:700}}>🪵 BOARDS &amp; LAMINATE</div>
            {boards.map(function(b){
              var t=WOOD_TEXTURES.find(function(x){return x.id===b.texture;}),act=b.id===selBid;
              return (
                <div key={b.id} style={Object.assign({},cardS,{border:act?"2.5px solid "+C.accent:undefined,background:act?C.cardB:C.card,marginBottom:10})}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,background:t?t.color:"#888",borderRadius:8,border:"3px solid "+(t?t.grain:"#666"),flexShrink:0}}/>
                    <div style={{flex:1}} onClick={function(){setSelBid(b.id);}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.t1,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{b.name}{act&&<span style={{fontSize:9,background:C.accent,color:C.topbar,borderRadius:4,padding:"1px 5px"}}>ACTIVE</span>}</div>
                      <div style={{fontSize:11,color:C.t3,marginTop:2}}>{b.widthMm}×{b.lengthMm}mm</div>
                    </div>
                    <button onClick={function(){setEditBoard(b);}} style={{background:C.inp,border:"1.5px solid "+C.border,borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:F,cursor:"pointer",color:C.t2}}>EDIT</button>
                  </div>
                </div>
              );
            })}
            <button onClick={addBoard} style={{width:"100%",border:"2px dashed "+C.border,borderRadius:12,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:14,marginBottom:18}}>
              <span style={{fontSize:20,color:C.accent}}>＋</span>
              <span style={{fontSize:11,letterSpacing:2,fontWeight:700,color:C.t3}}>ADD BOARD TYPE</span>
            </button>
            <div style={{height:1,background:C.border,marginBottom:14}}/>
            <div style={{fontSize:10,letterSpacing:2,color:C.vinyl,marginBottom:8,fontWeight:700}}>🎞 VINYL ROLLS</div>
            {vinyls.map(function(v){
              var vc=VINYL_COLORS.find(function(x){return x.id===v.color;}),act=v.id===selVid;
              return (
                <div key={v.id} style={{background:act?"#1A2C1A":C.card,border:act?"2.5px solid "+C.vinyl:"2px solid "+C.cardB,borderRadius:12,padding:"12px",marginBottom:10,boxShadow:"3px 3px 0 "+C.cardB}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,background:vc?vc.color:"#888",borderRadius:8,border:"3px solid "+(vc?vc.stripe:"#666"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎞</div>
                    <div style={{flex:1}} onClick={function(){setSelVid(v.id);}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.t1,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{v.name}{act&&<span style={{fontSize:9,background:C.vinyl,color:"#FFF",borderRadius:4,padding:"1px 5px"}}>ACTIVE</span>}</div>
                      <div style={{fontSize:11,color:C.t3,marginTop:2}}>{v.rollWidthMm}mm · {v.rollLengthM}m · {v.fixedWidth?"Fixed":"Flex"}</div>
                    </div>
                    <button onClick={function(){setEditVinyl(v);}} style={{background:"#1A2C1A",border:"1.5px solid "+C.vinylDim,borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,fontFamily:F,cursor:"pointer",color:C.vinylText}}>EDIT</button>
                  </div>
                </div>
              );
            })}
            <button onClick={addVinyl} style={{width:"100%",border:"2px dashed "+C.vinylDim,borderRadius:12,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:14,marginBottom:8}}>
              <span style={{fontSize:20,color:C.vinyl}}>＋</span>
              <span style={{fontSize:11,letterSpacing:2,fontWeight:700,color:C.vinylText}}>ADD VINYL ROLL</span>
            </button>
          </div>
        )}

        {/* ── RESULTS ── */}
        {tab==="results"&&(
          <div>
            {can?(
              <div>
                <div style={{display:"flex",gap:6,marginBottom:14}}>
                  <button onClick={function(){setResMode("boards");}} style={{flex:1,padding:"10px",border:"2px solid "+(resMode==="boards"?C.accent:C.border),borderRadius:10,background:resMode==="boards"?C.accent:C.card,color:resMode==="boards"?C.topbar:C.t3,fontSize:11,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:1}}>🪵 Boards</button>
                  <button onClick={function(){setResMode("vinyl");}} style={{flex:1,padding:"10px",border:"2px solid "+(resMode==="vinyl"?C.vinyl:C.border),borderRadius:10,background:resMode==="vinyl"?C.vinyl:C.card,color:resMode==="vinyl"?"#FFF":C.t3,fontSize:11,fontWeight:800,fontFamily:F,cursor:"pointer",letterSpacing:1}}>🎞 Vinyl</button>
                </div>
                {resMode==="boards"&&selB&&(
                  <div>
                    <AiPanel room={quickRoom} board={selB} boards={boards} wasteLog={[]} onSelectAlternative={function(){}}/>
                    <div style={cardS}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.t3,marginBottom:10,fontWeight:700}}>LAYOUT VISUALISATION</div>
                      <div style={{borderRadius:8,overflow:"hidden",border:"1.5px solid "+C.border,marginBottom:10}}><FloorCanvas room={quickRoom} board={selB} height={200}/></div>
                      <div style={{display:"flex",gap:10,fontSize:10,color:C.t3}}><span>■ <span style={{color:btex?btex.color:"#C8A46E"}}>Full</span></span><span>■ <span style={{color:"rgba(220,60,40,0.8)"}}>Cut</span></span></div>
                    </div>
                    <div style={cardS}><div style={{fontSize:9,letterSpacing:3,color:C.t3,marginBottom:10,fontWeight:700}}>STANDARD RESULTS</div><BoardResults room={quickRoom} board={selB}/></div>
                    <div style={cardS}><CuttingList room={quickRoom} board={selB}/></div>
                  </div>
                )}
                {resMode==="vinyl"&&selV&&(
                  <div>
                    <div style={vcardS}>
                      <div style={{fontSize:9,letterSpacing:3,color:C.vinylText,marginBottom:10,fontWeight:700}}>VINYL LAYOUT</div>
                      <div style={{borderRadius:8,overflow:"hidden",border:"1.5px solid "+C.vinylDim,marginBottom:10}}><VinylCanvas room={quickRoom} vinyl={selV} height={200}/></div>
                      <div style={{display:"flex",gap:10,fontSize:10,color:C.vinylText,flexWrap:"wrap"}}><span>■ Full strips</span><span>■ <span style={{color:"rgba(220,60,40,0.8)"}}>Cut</span></span><span>Lines=seams</span></div>
                    </div>
                    <div style={vcardS}><div style={{fontSize:9,letterSpacing:3,color:C.vinylText,marginBottom:10,fontWeight:700}}>RESULTS</div><VinylResults room={quickRoom} vinyl={selV}/></div>
                  </div>
                )}
              </div>
            ):(
              <div style={Object.assign({},cardS,{textAlign:"center",padding:"40px 20px"})}>
                <div style={{fontSize:40,marginBottom:12}}>📐</div>
                <div style={{fontSize:13,fontWeight:700,color:C.t1,marginBottom:8}}>No measurements yet</div>
                <div style={{fontSize:11,color:C.t3,marginBottom:20,lineHeight:1.6}}>Enter dimensions on the Home screen first</div>
                <button style={Object.assign({},obtnS,{width:"auto",padding:"12px 20px"})} onClick={function(){setTab("home");}}>GO TO HOME →</button>
              </div>
            )}
          </div>
        )}

      </div>
      </div>

      {/* ── BOTTOM BAR: only Home + Menu ── */}
      <div className="bottom-bar" style={{display:"flex",background:C.topbar,borderTop:"2px solid "+C.accent,flexShrink:0,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        <button onClick={function(){setTab("home");}} style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:tab==="home"?1:0.4}}>
          <span style={{fontSize:20,filter:tab==="home"?"none":"grayscale(1)"}}>🏠</span>
          <span style={{fontSize:8,letterSpacing:2,color:tab==="home"?C.accent:C.t3,fontFamily:F,fontWeight:tab==="home"?700:400}}>HOME</span>
        </button>
        <button onClick={function(){setTab("menu");}} style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:tab==="menu"?1:0.4}}>
          <span style={{fontSize:20,filter:tab==="menu"?"none":"grayscale(1)"}}>☰</span>
          <span style={{fontSize:8,letterSpacing:2,color:tab==="menu"?C.accent:C.t3,fontFamily:F,fontWeight:tab==="menu"?700:400}}>MENU</span>
        </button>
      </div>

      {/* ── MENU OVERLAY (full content pane when menu tab active) ── */}
      {tab==="menu"&&(
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:C.bg,display:"flex",flexDirection:"column",maxWidth:430,margin:"0 auto"}}>
          <div style={{background:C.topbar,padding:"12px 16px 10px",flexShrink:0,borderBottom:"3px solid "+C.accent,display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:18,color:C.accent}}>☰</div>
            <div>
              <div style={{fontSize:14,fontWeight:800,color:C.t1,letterSpacing:2}}>MENU</div>
              <div style={{fontSize:8,color:C.t3,letterSpacing:2,marginTop:1}}>ALL FEATURES</div>
            </div>
          </div>
          <MenuScreen onNav={function(id){navTo(id); setTab(id==="results_vinyl"?"results":id);}} projects={projects} boards={boards} vinyls={vinyls} stock={[]}/>
          <div style={{display:"flex",background:C.topbar,borderTop:"2px solid "+C.accent,flexShrink:0,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
            <button onClick={function(){setTab("home");}} style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:0.4}}>
              <span style={{fontSize:20,filter:"grayscale(1)"}}>🏠</span>
              <span style={{fontSize:8,letterSpacing:2,color:C.t3,fontFamily:F}}>HOME</span>
            </button>
            <button style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:1}}>
              <span style={{fontSize:20}}>☰</span>
              <span style={{fontSize:8,letterSpacing:2,color:C.accent,fontFamily:F,fontWeight:700}}>MENU</span>
            </button>
          </div>
        </div>
      )}

      {editBoard&&<BoardSheet board={editBoard} onUpdate={saveBoard} onClose={function(){setEditBoard(null);}} onDelete={function(){delBoard(editBoard.id);setEditBoard(null);}} canDelete={boards.length>1}/>}
      {editVinyl&&<VinylSheet vinyl={editVinyl} onUpdate={saveVinyl} onClose={function(){setEditVinyl(null);}} onDelete={function(){delVinyl(editVinyl.id);setEditVinyl(null);}} canDelete={vinyls.length>1}/>}
    </div>
  );
}
