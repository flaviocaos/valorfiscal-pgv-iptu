import { useState, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList
} from "recharts";

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  primary:"#534AB7", med:"#7F77DD", light:"#EEEDFE",
  green:"#3B6D11", greenBg:"#E8F5E1",
  amber:"#854F0B", amberBg:"#FFF3E0",
  red:"#A32D2D",   redBg:"#FDEAEA",
};

// ── Formatação pt-BR ──────────────────────────────────────────────────────────
const fmtBRL = v => (isNaN(+v)||v==null) ? "R$ 0,00"
  : (+v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtPct = v => (isNaN(+v)||v==null) ? "0,00%"
  : (+v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%";
const fmtNum = v => (isNaN(+v)||v==null) ? "0"
  : (+v).toLocaleString("pt-BR",{maximumFractionDigits:2});
const n = v => parseFloat(String(v).replace(/\./g,"").replace(",",".")) || 0;

// ── Parâmetros padrão ─────────────────────────────────────────────────────────
const DEFAULT_PARAMS = {
  municipio:"Município Exemplo",
  aliqTerritorial:1.5, aliqPredial:0.5,
  descBruto:0, descPredial:0, limiteAumento:50,
  cub:2800, cubCoef:"med",
  cubMin:0.6, cubMed:0.8, cubMax:1.0,
  fatores:{
    topografia:[
      {id:"FT1",desc:"Plano",coef:1.0},
      {id:"FT2",desc:"Aclive suave",coef:0.95},
      {id:"FT3",desc:"Declive suave",coef:0.90},
      {id:"FT4",desc:"Aclive/Declive forte",coef:0.80},
    ],
    pedologia:[
      {id:"FP1",desc:"Firme e seco",coef:1.0},
      {id:"FP2",desc:"Alagável",coef:0.80},
      {id:"FP3",desc:"Rochoso",coef:0.90},
    ],
    localizacao:[
      {id:"FL1",desc:"Esquina",coef:1.1},
      {id:"FL2",desc:"Meio de quadra",coef:1.0},
      {id:"FL3",desc:"Vila/Beco",coef:0.85},
    ],
    conservacao:[
      {id:"FCE1",desc:"Ótimo",coef:1.0},
      {id:"FCE2",desc:"Bom",coef:0.85},
      {id:"FCE3",desc:"Regular",coef:0.70},
      {id:"FCE4",desc:"Mau",coef:0.55},
      {id:"FCE5",desc:"Péssimo",coef:0.40},
    ],
  },
};

// ── Fator Gleba ───────────────────────────────────────────────────────────────
function fatorGleba(g){
  if(g<=2000)  return 1.0;
  if(g<=4000)  return 0.6;
  if(g<=10000) return 0.5;
  if(g<=20000) return 0.4;
  if(g<=50000) return 0.25;
  return 0.20;
}

// ── Motor de cálculo ──────────────────────────────────────────────────────────
function calcImovel(d, p){
  const area    = n(d.area_terreno);
  const face    = n(d.face_quadra);
  const fi      = n(d.fracao_ideal)||1;
  const areaCons= n(d.area_construida);
  const cubCoefVal = p.cubCoef==="min"?p.cubMin:p.cubCoef==="max"?p.cubMax:p.cubMed;
  const vm2c    = n(d.vm2c)||(p.cub*cubCoefVal);
  const qtd     = n(d.qtd_unidades)||1;
  const iptuAt  = n(d.iptu_atual);
  const ft      = n(d.fator_top)||1;
  const fp      = n(d.fator_ped)||1;
  const fl      = n(d.fator_loc)||1;
  const fce     = n(d.fator_cons)||1;

  const gleba   = area*fi;
  const fg      = gleba>2000 ? fatorGleba(gleba) : 1.0;
  const vvt     = area>0&&face>0 ? area*face*ft*fp*fl*fi*fg : 0;
  const vve     = areaCons>0 ? areaCons*vm2c*fce : 0;
  const vviBruto= vvt+vve;

  const dBeff   = p.descBruto===0?100:p.descBruto;
  const vviDesc = vviBruto*(dBeff/100);
  const dUnit   = p.descPredial/Math.max(qtd,1);
  const vviUtil = dUnit>=vviBruto ? 0 : Math.max(vviDesc-dUnit,0);

  const isPred  = areaCons>0;
  const aliq    = isPred?p.aliqPredial:p.aliqTerritorial;
  let iptuSim   = vviUtil*(aliq/100);
  let teto      = false;
  if(iptuAt>0&&p.limiteAumento>0){
    const tetoVal = iptuAt*(1+p.limiteAumento/100);
    if(iptuSim>tetoVal){iptuSim=tetoVal;teto=true;}
  }
  const variacao = iptuAt>0 ? ((iptuSim-iptuAt)/iptuAt)*100 : 0;

  return {
    area,face,fi,areaCons,vm2c,qtd,iptuAtual:iptuAt,
    ft,fp,fl,fce,gleba,fg,
    vvt,vve,vviBruto,dBeff,vviDesc,dUnit,vviUtil,
    isPred,aliq,iptuSimulado:iptuSim,tetoAtingido:teto,variacao,
  };
}

// ── Ícones (Tabler outline) ───────────────────────────────────────────────────
function Icon({name,size=20,color="currentColor"}){
  const S={fill:"none",stroke:color,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"};
  const P={
    dashboard:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    calculator:<><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="7" x2="8" y2="7"/><line x1="12" y1="7" x2="12" y2="7"/><line x1="16" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="17"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/></>,
    table:<><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="10" x2="10" y2="19"/></>,
    book:<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    download:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    upload:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    moon:<><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    sun:<><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    chart:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    building:<><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></>,
    code:<><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
    alert:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    copy:<><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    check:<><polyline points="20 6 9 17 4 12"/></>,
    x:<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" {...S}>{P[name]||null}</svg>;
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo(){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <div style={{background:C.primary,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 2px 8px ${C.primary}55`}}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="2"  y="13" width="4" height="9" rx="1" fill="white" opacity=".65"/>
          <rect x="10" y="8"  width="4" height="14" rx="1" fill="white" opacity=".82"/>
          <rect x="18" y="3"  width="4" height="19" rx="1" fill="white"/>
          <polyline points="4,11 12,6 22,2" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
          <polyline points="19,2 22,2 22,5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        </svg>
      </div>
      <div>
        <div style={{color:C.primary,fontWeight:800,fontSize:19,lineHeight:1,letterSpacing:-0.5}}>ValorFiscal</div>
        <div style={{color:C.med,fontSize:9,letterSpacing:2.5,fontWeight:700,marginTop:2}}>SIMULADOR PGV · IPTU</div>
      </div>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({label,color,bg}){
  return <span style={{background:bg||"#eee",color:color||"#333",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>;
}
function VarBadge({v,teto}){
  if(teto)    return <Badge label="TETO" color={C.red} bg={C.redBg}/>;
  if(v<0)     return <Badge label={fmtPct(v)} color={C.green} bg={C.greenBg}/>;
  if(v<=20)   return <Badge label={fmtPct(v)} color="#1e7e00" bg={C.greenBg}/>;
  if(v<=50)   return <Badge label={fmtPct(v)} color={C.amber} bg={C.amberBg}/>;
  return        <Badge label={fmtPct(v)} color={C.red} bg={C.redBg}/>;
}

// ── Inputs ────────────────────────────────────────────────────────────────────
const inpSt = {padding:"8px 11px",borderRadius:8,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
function Inp({label,value,onChange,type="text",step,placeholder}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:12,fontWeight:600,color:"var(--muted)"}}>{label}</label>}
      <input type={type} value={value} step={step} placeholder={placeholder}
        onChange={e=>onChange(e.target.value)}
        style={{...inpSt,border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)"}}/>
    </div>
  );
}
function Sel({label,value,onChange,options}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {label&&<label style={{fontSize:12,fontWeight:600,color:"var(--muted)"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{...inpSt,border:"1.5px solid var(--border)",background:"var(--input-bg)",color:"var(--text)"}}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Card métrica ──────────────────────────────────────────────────────────────
function MetricCard({label,value,sub,icon,accent}){
  return(
    <div style={{background:"var(--card)",borderRadius:14,padding:"18px 20px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
      <div style={{background:accent?accent+"22":C.light,borderRadius:10,padding:10,flexShrink:0}}>
        <Icon name={icon} size={22} color={accent||C.primary}/>
      </div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:11,color:"var(--muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:2}}>{label}</div>
        <div style={{fontSize:21,fontWeight:800,color:"var(--text)",lineHeight:1.1}}>{value}</div>
        {sub&&<div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Botão ─────────────────────────────────────────────────────────────────────
function Btn({children,onClick,color,outline,small,icon}){
  const bg=outline?"transparent":color||C.primary;
  const cl=outline?color||C.primary:"white";
  return(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:7,background:bg,color:cl,border:`1.5px solid ${color||C.primary}`,borderRadius:9,padding:small?"6px 13px":"9px 18px",fontWeight:700,fontSize:small?12:13,cursor:"pointer",whiteSpace:"nowrap"}}>
      {icon&&<Icon name={icon} size={small?14:16} color={cl}/>}{children}
    </button>
  );
}

// ── Tooltip Recharts ──────────────────────────────────────────────────────────
function ChartTooltip({active,payload,label}){
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:"var(--card)",border:"1.5px solid var(--border)",borderRadius:8,padding:"8px 14px",fontSize:12,boxShadow:"0 2px 8px var(--shadow)"}}>
      <div style={{fontWeight:700,marginBottom:4}}>{label}</div>
      <div>{payload[0]?.value} imóvel(is)</div>
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({slices,size=160,thickness=34}){
  const r=(size-thickness)/2, cx=size/2, cy=size/2;
  const circ=2*Math.PI*r;
  const total=slices.reduce((a,b)=>a+b.value,0)||1;
  let offset=0;
  return(
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      {slices.map((s,i)=>{
        const dash=(s.value/total)*circ;
        const gap=circ-dash;
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
          strokeWidth={thickness} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}
          style={{transition:"stroke-dasharray .4s"}}/>;
        offset+=dash; return el;
      })}
    </svg>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function HeatmapBar({lote}){
  if(!lote.length) return null;
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
      {lote.map((r,i)=>{
        let bg=C.green;
        if(r.tetoAtingido) bg="#7A1F1F";
        else if(r.variacao<0)   bg="#2E8B00";
        else if(r.variacao<=20) bg="#5BAA3A";
        else if(r.variacao<=50) bg="#D4830A";
        else                    bg=C.red;
        return(
          <div key={i} title={`${r.inscricao||"—"}: ${r.tetoAtingido?"TETO":fmtPct(r.variacao)}`}
            style={{width:22,height:22,borderRadius:4,background:bg,cursor:"default",boxShadow:"0 1px 3px var(--shadow)",transition:"transform .15s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.35)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
          />
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA 1 — Dashboard
// ══════════════════════════════════════════════════════════════════════════════
function TabDashboard({lote}){
  const stats=useMemo(()=>{
    let somaAt=0,somaSim=0,nPred=0,nTerr=0,nTeto=0,nIsento=0;
    const faixas={reducao:0,ate20:0,de20_50:0,acima50:0,teto:0};
    lote.forEach(r=>{
      somaAt+=r.iptuAtual; somaSim+=r.iptuSimulado;
      if(r.isPred) nPred++; else nTerr++;
      if(r.tetoAtingido) nTeto++;
      if(r.iptuSimulado===0) nIsento++;
      if(r.tetoAtingido) faixas.teto++;
      else if(r.variacao<0)   faixas.reducao++;
      else if(r.variacao<=20) faixas.ate20++;
      else if(r.variacao<=50) faixas.de20_50++;
      else                    faixas.acima50++;
    });
    const varMedia=lote.length?lote.reduce((a,b)=>a+b.variacao,0)/lote.length:0;
    const impacto=somaSim-somaAt;
    const ranking=[...lote].sort((a,b)=>b.iptuSimulado-a.iptuSimulado).slice(0,8);
    const anomalias=lote.filter(r=>r.variacao>100&&!r.tetoAtingido);
    const histArr=lote.map((r,i)=>({
      sim:i+1,
      somaAt:+lote.slice(0,i+1).reduce((a,b)=>a+b.iptuAtual,0).toFixed(2),
      somaSim:+lote.slice(0,i+1).reduce((a,b)=>a+b.iptuSimulado,0).toFixed(2),
    }));
    return{total:lote.length,somaAt,somaSim,varMedia,faixas,nPred,nTerr,nTeto,nIsento,impacto,ranking,anomalias,histArr};
  },[lote]);

  const barData=[
    {name:"Redução",   q:stats.faixas.reducao,  fill:C.green},
    {name:"Até 20%",   q:stats.faixas.ate20,    fill:"#5BAA3A"},
    {name:"20–50%",    q:stats.faixas.de20_50,  fill:"#D4830A"},
    {name:"Acima 50%", q:stats.faixas.acima50,  fill:C.red},
    {name:"Teto",      q:stats.faixas.teto,     fill:"#7A1F1F"},
  ];
  const donutTipo=[
    {value:stats.nPred,color:C.primary,label:"Predial"},
    {value:stats.nTerr,color:C.med,label:"Territorial"},
  ];
  const donutStatus=[
    {value:stats.nTeto,color:"#7A1F1F",label:"Teto"},
    {value:stats.nIsento,color:C.amber,label:"Isento"},
    {value:stats.total-stats.nTeto-stats.nIsento,color:C.green,label:"Normal"},
  ];
  const varAcc=stats.varMedia<0?C.green:stats.varMedia>50?C.red:C.amber;
  const impAcc=stats.impacto>=0?C.red:C.green;
  const empty=lote.length===0;
  const emptyMsg=<div style={{textAlign:"center",color:"var(--muted)",padding:"44px 0",fontSize:13}}>Nenhum imóvel simulado. Use o Simulador ou Lote.</div>;
  const sec=(title,sub,children)=>(
    <div style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:sub?2:14}}>{title}</div>
      {sub&&<div style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>{sub}</div>}
      {children}
    </div>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        <MetricCard label="Imóveis Simulados"  value={fmtNum(stats.total)}    icon="building"   accent={C.primary}/>
        <MetricCard label="IPTU Simulado Total" value={fmtBRL(stats.somaSim)} icon="calculator" accent={C.med}/>
        <MetricCard label="IPTU Atual Total"    value={fmtBRL(stats.somaAt)}  icon="chart"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        <MetricCard label="Variação Média"    value={fmtPct(stats.varMedia)} icon="alert"  accent={varAcc} sub={stats.total?`Sobre ${stats.total} imóvel(is)`:undefined}/>
        <MetricCard label="Impacto Financeiro" value={fmtBRL(stats.impacto)} icon="chart"  accent={impAcc} sub={stats.impacto>=0?"Aumento sobre arrecadação":"Redução sobre arrecadação"}/>
        <MetricCard label="Atingiram o Teto"  value={fmtNum(stats.nTeto)}   icon="alert"  accent={stats.nTeto>0?C.red:C.green} sub={stats.total?`${fmtPct(stats.nTeto/stats.total*100)} do total`:undefined}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:14}}>
        {sec("Distribuição por Faixa de Variação","Quantidade de imóveis por categoria",
          empty?emptyMsg:
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={barData} margin={{top:8,right:8,left:-14,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="name" tick={{fontSize:11,fill:"var(--muted)"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"var(--muted)"}} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip content={<ChartTooltip/>}/>
              <Bar dataKey="q" radius={[7,7,0,0]} maxBarSize={56}>
                {barData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                <LabelList dataKey="q" position="top" style={{fontSize:11,fontWeight:700,fill:"var(--muted)"}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {sec("Tipo de Imóvel",null,
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{position:"relative",flexShrink:0}}>
                <DonutChart slices={donutTipo} size={100} thickness={24}/>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",lineHeight:1}}>
                  <div style={{fontSize:16,fontWeight:800}}>{stats.total}</div>
                  <div style={{fontSize:9,color:"var(--muted)"}}>total</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
                {donutTipo.map(s=>(
                  <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:10,height:10,borderRadius:3,background:s.color}}/>
                      <span style={{fontSize:12,color:"var(--muted)"}}>{s.label}</span>
                    </div>
                    <span style={{fontWeight:700,fontSize:13}}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sec("Status",null,
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{position:"relative",flexShrink:0}}>
                <DonutChart slices={donutStatus} size={100} thickness={24}/>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",lineHeight:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:stats.nTeto>0?C.red:C.green}}>{stats.nTeto}</div>
                  <div style={{fontSize:9,color:"var(--muted)"}}>teto</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
                {donutStatus.map(s=>(
                  <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:10,height:10,borderRadius:3,background:s.color}}/>
                      <span style={{fontSize:12,color:"var(--muted)"}}>{s.label}</span>
                    </div>
                    <span style={{fontWeight:700,fontSize:13}}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {stats.histArr.length>1&&sec("Histórico Acumulado","Evolução do IPTU atual × simulado conforme imóveis são adicionados",
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stats.histArr} margin={{top:4,right:8,left:0,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
            <XAxis dataKey="sim" tick={{fontSize:10,fill:"var(--muted)"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:"var(--muted)"}} axisLine={false} tickLine={false} tickFormatter={v=>"R$"+Math.round(v/1000)+"k"}/>
            <Tooltip formatter={(v,k)=>[fmtBRL(v),k==="somaAt"?"Atual Acum.":"Simulado Acum."]} contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}}/>
            <Bar dataKey="somaAt"  fill="#AAAACC" radius={[4,4,0,0]} maxBarSize={22}/>
            <Bar dataKey="somaSim" fill={C.primary} radius={[4,4,0,0]} maxBarSize={22}/>
          </BarChart>
        </ResponsiveContainer>
      )}

      {lote.length>0&&sec("Mapa de Calor — Variação por Imóvel","Passe o mouse sobre cada célula para ver inscrição e variação",
        <>
          <HeatmapBar lote={lote}/>
          <div style={{display:"flex",gap:14,marginTop:12,flexWrap:"wrap"}}>
            {[["Redução",C.green],["Até 20%","#5BAA3A"],["20–50%","#D4830A"],["Acima 50%",C.red],["Teto","#7A1F1F"]].map(([l,c])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:12,height:12,borderRadius:3,background:c}}/>
                <span style={{fontSize:11,color:"var(--muted)"}}>{l}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {lote.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {sec("🏆 Ranking — Maior IPTU Simulado","Top 8 imóveis por valor simulado",
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
                {["#","Inscrição","Tipo","IPTU Sim.","Variação"].map(h=>(
                  <th key={h} style={{padding:"5px 8px",textAlign:"left",color:"var(--muted)",fontWeight:700}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {stats.ranking.map((r,i)=>(
                  <tr key={i} style={{background:i%2===0?"var(--row-alt)":"transparent"}}>
                    <td style={{padding:"5px 8px",fontWeight:800,color:i===0?C.amber:i===1?"#888":i===2?"#A0522D":"var(--muted)"}}>{i+1}</td>
                    <td style={{padding:"5px 8px",fontFamily:"monospace",fontSize:11}}>{r.inscricao||"—"}</td>
                    <td style={{padding:"5px 8px"}}><Badge label={r.isPred?"Pred.":"Terr."} color={C.primary} bg={C.light}/></td>
                    <td style={{padding:"5px 8px",fontWeight:700,color:C.primary}}>{fmtBRL(r.iptuSimulado)}</td>
                    <td style={{padding:"5px 8px"}}><VarBadge v={r.variacao} teto={r.tetoAtingido}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sec("⚠ Auditoria — Anomalias",`Variação > 100% sem teto (${stats.anomalias.length} encontrado(s))`,
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[
                  {l:"Teto atingido",v:stats.nTeto,c:stats.nTeto>0?C.red:C.green,bg:stats.nTeto>0?C.redBg:C.greenBg},
                  {l:"Isentos (IPTU=0)",v:stats.nIsento,c:C.amber,bg:C.amberBg},
                  {l:"Var.>100% s/teto",v:stats.anomalias.length,c:stats.anomalias.length>0?C.red:C.green,bg:stats.anomalias.length>0?C.redBg:C.greenBg},
                  {l:"IPTU atual zerado",v:lote.filter(r=>r.iptuAtual===0).length,c:"var(--muted)",bg:"var(--row-alt)"},
                ].map(({l,v,c,bg})=>(
                  <div key={l} style={{background:bg,borderRadius:9,padding:"9px 12px"}}>
                    <div style={{fontSize:11,color:c,fontWeight:600}}>{l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              {stats.anomalias.length>0
                ?<table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Inscrição","IPTU Atual","IPTU Sim.","Var.%"].map(h=>(
                      <th key={h} style={{padding:"4px 7px",textAlign:"left",color:"var(--muted)",fontWeight:700}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {stats.anomalias.map((r,i)=>(
                      <tr key={i} style={{background:C.redBg}}>
                        <td style={{padding:"4px 7px",fontFamily:"monospace"}}>{r.inscricao||"—"}</td>
                        <td style={{padding:"4px 7px"}}>{fmtBRL(r.iptuAtual)}</td>
                        <td style={{padding:"4px 7px",fontWeight:700}}>{fmtBRL(r.iptuSimulado)}</td>
                        <td style={{padding:"4px 7px"}}><VarBadge v={r.variacao} teto={false}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                :<div style={{textAlign:"center",color:C.green,fontWeight:600,fontSize:13,padding:"16px 0"}}>✓ Nenhuma anomalia</div>
              }
            </>
          )}
        </div>
      )}

      {lote.length>0&&sec("Últimos Imóveis Simulados",null,
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
              {["Inscrição","Tipo","VVI","IPTU Atual","IPTU Simulado","Variação","Teto"].map(h=>(
                <th key={h} style={{padding:"6px 10px",textAlign:"left",color:"var(--muted)",fontWeight:700}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...lote].reverse().slice(0,10).map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"var(--row-alt)":"transparent"}}>
                  <td style={{padding:"6px 10px",fontFamily:"monospace"}}>{r.inscricao||"—"}</td>
                  <td style={{padding:"6px 10px"}}><Badge label={r.isPred?"Predial":"Territorial"} color={C.primary} bg={C.light}/></td>
                  <td style={{padding:"6px 10px"}}>{fmtBRL(r.vviUtil)}</td>
                  <td style={{padding:"6px 10px"}}>{fmtBRL(r.iptuAtual)}</td>
                  <td style={{padding:"6px 10px",fontWeight:700,color:C.primary}}>{fmtBRL(r.iptuSimulado)}</td>
                  <td style={{padding:"6px 10px"}}><VarBadge v={r.variacao} teto={r.tetoAtingido}/></td>
                  <td style={{padding:"6px 10px"}}>{r.tetoAtingido?<Badge label="✓" color={C.red} bg={C.redBg}/>:"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA 2 — Parâmetros
// ══════════════════════════════════════════════════════════════════════════════
function TabParametros({params,setParams}){
  const [local,setLocal]=useState(params);
  const [saved,setSaved]=useState(false);
  const upd=(k,v)=>setLocal(p=>({...p,[k]:v}));
  const updF=(tipo,i,field,val)=>{
    const arr=[...local.fatores[tipo]];
    arr[i]={...arr[i],[field]:val};
    setLocal(p=>({...p,fatores:{...p.fatores,[tipo]:arr}}));
  };
  const addF=tipo=>{
    const arr=[...local.fatores[tipo],{id:`F${Date.now()}`,desc:"Novo",coef:1.0}];
    setLocal(p=>({...p,fatores:{...p.fatores,[tipo]:arr}}));
  };
  const remF=(tipo,i)=>{
    const arr=local.fatores[tipo].filter((_,j)=>j!==i);
    setLocal(p=>({...p,fatores:{...p.fatores,[tipo]:arr}}));
  };
  const save=()=>{setParams(local);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const TIPOS={topografia:"Topografia (FT)",pedologia:"Pedologia (FP)",localizacao:"Localização (FL)",conservacao:"Conservação (FCE)"};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <section style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Dados do Município</div>
        <Inp label="Nome do Município" value={local.municipio} onChange={v=>upd("municipio",v)}/>
      </section>
      <section style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Alíquotas e Descontos</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
          <Inp label="Alíquota Territorial (%)" type="number" step="0.01" value={local.aliqTerritorial} onChange={v=>upd("aliqTerritorial",parseFloat(v)||0)}/>
          <Inp label="Alíquota Predial (%)"     type="number" step="0.01" value={local.aliqPredial}     onChange={v=>upd("aliqPredial",parseFloat(v)||0)}/>
          <Inp label="Limite Máx. Aumento (%)"  type="number" step="0.01" value={local.limiteAumento}   onChange={v=>upd("limiteAumento",parseFloat(v)||0)}/>
          <Inp label="Desconto Bruto (%)"        type="number" step="0.01" value={local.descBruto}       onChange={v=>upd("descBruto",parseFloat(v)||0)}/>
          <Inp label="Desconto Predial (R$)"     type="number" step="0.01" value={local.descPredial}     onChange={v=>upd("descPredial",parseFloat(v)||0)}/>
        </div>
        <div style={{marginTop:10,fontSize:11,color:"var(--muted)"}}>⚠ Desconto Bruto = 0 → tratado como 100% (sem desconto bruto)</div>
      </section>
      <section style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>CUB — Custo Unitário Básico</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>
          <Inp label="Valor CUB (R$/m²)" type="number" step="0.01" value={local.cub}   onChange={v=>upd("cub",parseFloat(v)||0)}/>
          <Inp label="Coef. Mínimo"      type="number" step="0.01" value={local.cubMin} onChange={v=>upd("cubMin",parseFloat(v)||0)}/>
          <Inp label="Coef. Médio"       type="number" step="0.01" value={local.cubMed} onChange={v=>upd("cubMed",parseFloat(v)||0)}/>
          <Inp label="Coef. Máximo"      type="number" step="0.01" value={local.cubMax} onChange={v=>upd("cubMax",parseFloat(v)||0)}/>
        </div>
        <Sel label="Coeficiente Padrão" value={local.cubCoef} onChange={v=>upd("cubCoef",v)}
          options={[{value:"min",label:"Mínimo"},{value:"med",label:"Médio"},{value:"max",label:"Máximo"}]}/>
        <div style={{marginTop:10,fontSize:12,color:"var(--muted)"}}>
          VM2C padrão: {fmtBRL(local.cub*(local.cubCoef==="min"?local.cubMin:local.cubCoef==="max"?local.cubMax:local.cubMed))}
        </div>
      </section>
      {Object.entries(TIPOS).map(([tipo,label])=>(
        <section key={tipo} style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:14}}>Fatores — {label}</div>
            <Btn small icon="plus" onClick={()=>addF(tipo)}>Adicionar</Btn>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
              {["Código","Descrição","Coeficiente",""].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:"var(--muted)",fontWeight:700}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {local.fatores[tipo].map((f,i)=>(
                <tr key={i} style={{background:i%2===0?"var(--row-alt)":"transparent"}}>
                  <td style={{padding:"4px 8px"}}><input value={f.id} onChange={e=>updF(tipo,i,"id",e.target.value)} style={{width:90,padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontSize:12}}/></td>
                  <td style={{padding:"4px 8px"}}><input value={f.desc} onChange={e=>updF(tipo,i,"desc",e.target.value)} style={{width:"100%",padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontSize:12}}/></td>
                  <td style={{padding:"4px 8px"}}><input type="number" step="0.01" value={f.coef} onChange={e=>updF(tipo,i,"coef",parseFloat(e.target.value)||0)} style={{width:80,padding:"4px 7px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontSize:12}}/></td>
                  <td style={{padding:"4px 8px"}}><button onClick={()=>remF(tipo,i)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon name="trash" size={15} color={C.red}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <Btn icon={saved?"check":"settings"} color={saved?C.green:C.primary} onClick={save}>
          {saved?"Parâmetros Salvos!":"Salvar Parâmetros"}
        </Btn>
        {saved&&<span style={{color:C.green,fontSize:13,fontWeight:600}}>✓ Aplicado em todo o app</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA 3 — Simulador Individual
// ══════════════════════════════════════════════════════════════════════════════
function TabSimulador({params,onAddLote}){
  const cubVM2C=useCallback(()=>{
    const c=params.cubCoef==="min"?params.cubMin:params.cubCoef==="max"?params.cubMax:params.cubMed;
    return params.cub*c;
  },[params]);
  const [form,setForm]=useState({area_terreno:"",face_quadra:"",fracao_ideal:"1",area_construida:"",vm2c:"",qtd_unidades:"1",fator_top:"",fator_ped:"",fator_loc:"",fator_cons:"",iptu_atual:""});
  const [res,setRes]=useState(null);
  const [added,setAdded]=useState(false);
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const fatOpts=tipo=>params.fatores[tipo].map(f=>({value:String(f.coef),label:`${f.id} — ${f.desc} (${f.coef})`}));
  const calc=()=>{const d={...form};if(!d.vm2c)d.vm2c=cubVM2C();setRes(calcImovel(d,params));setAdded(false);};
  const doAdd=()=>{if(!res)return;const d={...form,vm2c:form.vm2c||cubVM2C()};onAddLote({...calcImovel(d,params),inscricao:`SIM-${Date.now()}`});setAdded(true);};

  const steps=res?[
    {l:"Área Terreno",f:"Entrada",v:fmtNum(res.area)+" m²"},
    {l:"Face de Quadra",f:"Entrada",v:fmtBRL(res.face)+"/m²"},
    {l:"Fração Ideal",f:"Entrada",v:res.fi},
    {l:"FT × FP × FL",f:`${res.ft} × ${res.fp} × ${res.fl}`,v:(res.ft*res.fp*res.fl).toFixed(4)},
    {l:"Área Gleba",f:"Área × Fração",v:fmtNum(res.gleba)+" m²"},
    {l:"Fator Gleba",f:"Tabela progressiva",v:res.fg+(res.gleba>2000?" (aplicado)":" (≤2000m²)")},
    {l:"VVT",f:"Área×Face×FT×FP×FL×FI×FGleba",v:fmtBRL(res.vvt)},
    {l:"VM2C",f:"CUB × Coeficiente",v:fmtBRL(res.vm2c)},
    {l:"FCE",f:"Conservação",v:res.fce},
    {l:"VVE",f:"Área Cons.×VM2C×FCE",v:fmtBRL(res.vve)},
    {l:"VVI Bruto",f:"VVT + VVE",v:fmtBRL(res.vviBruto)},
    {l:"VVI c/ Desc. Bruto",f:`VVI × ${res.dBeff}%`,v:fmtBRL(res.vviDesc)},
    {l:"Desc. Predial/Unidade",f:`R$${params.descPredial}÷${res.qtd}`,v:fmtBRL(res.dUnit)},
    {l:"VVI Utilizado",f:"VVI Desc. − Desc. Unit.",v:fmtBRL(res.vviUtil)},
    {l:"Alíquota",f:res.isPred?"Predial":"Territorial",v:res.aliq+"%"},
    {l:"IPTU (bruto)",f:`VVI×${res.aliq}%`,v:fmtBRL(res.vviUtil*res.aliq/100)},
    {l:"Teto de Aumento",f:`Atual×${1+params.limiteAumento/100}`,v:res.iptuAtual>0?fmtBRL(res.iptuAtual*(1+params.limiteAumento/100)):"N/A"},
    {l:"IPTU Final",f:res.tetoAtingido?"Teto aplicado":"Sem teto",v:fmtBRL(res.iptuSimulado)},
  ]:[];

  return(
    <div style={{display:"flex",gap:22}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:16}}>
        <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
          <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Dados do Terreno</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <Inp label="Área Terreno (m²)"     value={form.area_terreno}  onChange={v=>upd("area_terreno",v)}/>
            <Inp label="Face de Quadra (R$/m²)" value={form.face_quadra}  onChange={v=>upd("face_quadra",v)}/>
            <Inp label="Fração Ideal"           value={form.fracao_ideal} onChange={v=>upd("fracao_ideal",v)}/>
          </div>
        </section>
        <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
          <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Dados da Edificação</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <Inp label="Área Construída (m²)"        value={form.area_construida} onChange={v=>upd("area_construida",v)}/>
            <Inp label={`VM2C (padrão ${fmtBRL(cubVM2C())})`} value={form.vm2c} onChange={v=>upd("vm2c",v)} placeholder={String(cubVM2C().toFixed(2))}/>
            <Inp label="Qtd. Unidades"               value={form.qtd_unidades}   onChange={v=>upd("qtd_unidades",v)}/>
          </div>
        </section>
        <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
          <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Fatores de Valorização</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Sel label="Topografia (FT)"   value={form.fator_top}  onChange={v=>upd("fator_top",v)}  options={[{value:"",label:"— padrão 1,0 —"},...fatOpts("topografia")]}/>
            <Sel label="Pedologia (FP)"    value={form.fator_ped}  onChange={v=>upd("fator_ped",v)}  options={[{value:"",label:"— padrão 1,0 —"},...fatOpts("pedologia")]}/>
            <Sel label="Localização (FL)"  value={form.fator_loc}  onChange={v=>upd("fator_loc",v)}  options={[{value:"",label:"— padrão 1,0 —"},...fatOpts("localizacao")]}/>
            <Sel label="Conservação (FCE)" value={form.fator_cons} onChange={v=>upd("fator_cons",v)} options={[{value:"",label:"— padrão 1,0 —"},...fatOpts("conservacao")]}/>
          </div>
        </section>
        <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
          <Inp label="IPTU Atual (R$)" value={form.iptu_atual} onChange={v=>upd("iptu_atual",v)}/>
        </section>
        <Btn icon="calculator" onClick={calc}>Calcular</Btn>
      </div>
      {res&&(
        <div style={{width:360,flexShrink:0,display:"flex",flexDirection:"column",gap:14}}>
          <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
            <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Resultado</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[["VVT",fmtBRL(res.vvt)],["VVE",fmtBRL(res.vve)],["VVI Bruto",fmtBRL(res.vviBruto)],["VVI Utilizado",fmtBRL(res.vviUtil)]].map(([l,v])=>(
                <div key={l} style={{background:"var(--row-alt)",borderRadius:9,padding:"10px 13px"}}>
                  <div style={{fontSize:11,color:"var(--muted)",fontWeight:600}}>{l}</div>
                  <div style={{fontSize:15,fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",flexDirection:"column",gap:9}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"var(--muted)"}}>IPTU Atual</span><span style={{fontWeight:700}}>{fmtBRL(res.iptuAtual)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"var(--muted)"}}>IPTU Simulado</span><span style={{fontSize:20,fontWeight:800,color:C.primary}}>{fmtBRL(res.iptuSimulado)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"var(--muted)"}}>Variação</span><VarBadge v={res.variacao} teto={res.tetoAtingido}/></div>
              <div style={{display:"flex",gap:7,marginTop:4,flexWrap:"wrap"}}>
                <Badge label={res.isPred?"Predial":"Territorial"} color={C.primary} bg={C.light}/>
                {res.tetoAtingido&&<Badge label="TETO ATINGIDO" color={C.red} bg={C.redBg}/>}
              </div>
            </div>
          </section>
          <section style={{background:"var(--card)",borderRadius:14,padding:18,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)",maxHeight:360,overflowY:"auto"}}>
            <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Passo a Passo</div>
            {steps.map((s,i)=>(
              <div key={i} style={{borderBottom:"1px solid var(--border)",padding:"7px 0",display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
                <div><div style={{fontSize:12,fontWeight:600}}>{s.l}</div><div style={{fontSize:11,color:"var(--muted)"}}>{s.f}</div></div>
                <div style={{fontWeight:700,fontSize:12,textAlign:"right",flexShrink:0}}>{s.v}</div>
              </div>
            ))}
          </section>
          <Btn icon={added?"check":"plus"} color={added?C.green:C.med} onClick={doAdd}>{added?"Adicionado ao Lote!":"Adicionar ao Lote"}</Btn>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA 4 — Simulação em Lote
// ══════════════════════════════════════════════════════════════════════════════
function TabLote({params,lote,setLote}){
  const fileRef=useRef();
  const empty=()=>({inscricao:"",area_terreno:"",face_quadra:"",fracao_ideal:"1",area_construida:"",vm2c:"",qtd_unidades:"1",fator_top:"1",fator_ped:"1",fator_loc:"1",fator_cons:"1",iptu_atual:""});
  const [rows,setRows]=useState([empty()]);
  const updR=(i,k,v)=>setRows(r=>{const a=[...r];a[i]={...a[i],[k]:v};return a;});
  const calcAll=()=>{setLote(rows.map((r,i)=>({...calcImovel(r,params),inscricao:r.inscricao||`L${String(i+1).padStart(3,"0")}`})));};
  const handleCSV=e=>{
    const f=e.target.files[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const lines=ev.target.result.trim().split("\n");
      const headers=lines[0].split(",").map(h=>h.trim());
      const parsed=lines.slice(1).map(line=>{const vals=line.split(",");const obj={};headers.forEach((h,i)=>obj[h]=(vals[i]||"").trim());return obj;});
      setRows(parsed.length?parsed:[empty()]);
    };
    reader.readAsText(f);e.target.value="";
  };
  const exportCSV=()=>{
    if(!lote.length)return;
    const h="inscricao,tipo,area_terreno,area_construida,vvt,vve,vvi_utilizado,iptu_atual,iptu_simulado,variacao_pct,teto";
    const rows_=lote.map(r=>[r.inscricao,r.isPred?"Predial":"Territorial",r.area.toFixed(2),r.areaCons.toFixed(2),r.vvt.toFixed(2),r.vve.toFixed(2),r.vviUtil.toFixed(2),r.iptuAtual.toFixed(2),r.iptuSimulado.toFixed(2),r.variacao.toFixed(2),r.tetoAtingido?"S":"N"].join(","));
    const blob=new Blob([[h,...rows_].join("\n")],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="valorfiscal_lote.csv";a.click();
  };
  const tots=useMemo(()=>({at:lote.reduce((a,b)=>a+b.iptuAtual,0),sim:lote.reduce((a,b)=>a+b.iptuSimulado,0),vmed:lote.length?lote.reduce((a,b)=>a+b.variacao,0)/lote.length:0}),[lote]);
  const COLS=["inscricao","area_terreno","face_quadra","fracao_ideal","area_construida","vm2c","qtd_unidades","fator_top","fator_ped","fator_loc","fator_cons","iptu_atual"];
  const HEADS=["Inscrição","Área Ter.","Face Quad.","Fr.Ideal","Área Cons.","VM2C","Unid.","FT","FP","FL","FCE","IPTU Atual"];
  const WIDTHS=[100,72,78,60,78,78,55,55,55,55,55,80];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <Btn icon="plus" onClick={()=>setRows(r=>[...r,empty()])}>Linha</Btn>
        <Btn icon="upload" outline onClick={()=>fileRef.current.click()}>Upload CSV</Btn>
        <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
        <Btn icon="calculator" color={C.green} onClick={calcAll}>Calcular Todos</Btn>
        <Btn icon="download" outline onClick={exportCSV}>Exportar CSV</Btn>
        {lote.length>0&&<span style={{fontSize:12,color:"var(--muted)"}}>→ {lote.length} resultado(s)</span>}
      </div>
      <div style={{background:"var(--card)",borderRadius:14,padding:18,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)",overflowX:"auto"}}>
        <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>Dados de Entrada</div>
        <table style={{borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
            {HEADS.map((h,i)=><th key={h} style={{padding:"5px 5px",textAlign:"left",color:"var(--muted)",fontWeight:700,minWidth:WIDTHS[i]}}>{h}</th>)}
            <th/>
          </tr></thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={i} style={{background:i%2===0?"var(--row-alt)":"transparent"}}>
                {COLS.map((k,ci)=>(
                  <td key={k} style={{padding:"3px 4px"}}>
                    <input value={row[k]||""} onChange={e=>updR(i,k,e.target.value)} style={{width:WIDTHS[ci]-6,padding:"4px 5px",borderRadius:6,border:"1px solid var(--border)",background:"var(--input-bg)",color:"var(--text)",fontSize:11}}/>
                  </td>
                ))}
                <td style={{padding:"3px 5px"}}><button onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer"}}><Icon name="trash" size={14} color={C.red}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lote.length>0&&(
        <div style={{background:"var(--card)",borderRadius:14,padding:18,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)",overflowX:"auto"}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>Resultados</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{borderBottom:"2px solid var(--border)"}}>
              {["Inscrição","Tipo","Área Ter.","Área Cons.","VVT","VVE","VVI","IPTU Atual","IPTU Sim.","Variação","Teto"].map(h=>(
                <th key={h} style={{padding:"5px 8px",textAlign:"left",color:"var(--muted)",fontWeight:700}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lote.map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"var(--row-alt)":"transparent"}}>
                  <td style={{padding:"5px 8px",fontFamily:"monospace"}}>{r.inscricao}</td>
                  <td style={{padding:"5px 8px"}}><Badge label={r.isPred?"Predial":"Territ."} color={C.primary} bg={C.light}/></td>
                  <td style={{padding:"5px 8px"}}>{fmtNum(r.area)}</td>
                  <td style={{padding:"5px 8px"}}>{fmtNum(r.areaCons)}</td>
                  <td style={{padding:"5px 8px"}}>{fmtBRL(r.vvt)}</td>
                  <td style={{padding:"5px 8px"}}>{fmtBRL(r.vve)}</td>
                  <td style={{padding:"5px 8px"}}>{fmtBRL(r.vviUtil)}</td>
                  <td style={{padding:"5px 8px"}}>{fmtBRL(r.iptuAtual)}</td>
                  <td style={{padding:"5px 8px",fontWeight:700,color:C.primary}}>{fmtBRL(r.iptuSimulado)}</td>
                  <td style={{padding:"5px 8px"}}><VarBadge v={r.variacao} teto={r.tetoAtingido}/></td>
                  <td style={{padding:"5px 8px"}}>{r.tetoAtingido?<Badge label="SIM" color={C.red} bg={C.redBg}/>:"—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{borderTop:"2px solid var(--border)",background:"var(--row-alt)"}}>
                <td colSpan={7} style={{padding:"8px 8px",fontSize:12,fontWeight:700}}>TOTAIS — {lote.length} imóvel(is)</td>
                <td style={{padding:"8px 8px",fontWeight:700}}>{fmtBRL(tots.at)}</td>
                <td style={{padding:"8px 8px",fontWeight:800,color:C.primary}}>{fmtBRL(tots.sim)}</td>
                <td style={{padding:"8px 8px"}}><VarBadge v={tots.vmed} teto={false}/></td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA 5 — Detalhamento
// ══════════════════════════════════════════════════════════════════════════════
function TabDetalhamento({params}){
  const cubDef=params.cub*(params.cubCoef==="min"?params.cubMin:params.cubCoef==="max"?params.cubMax:params.cubMed);
  const [ex,setEx]=useState({area:200,face:500,ft:1,fp:1,fl:1,fi:1,areaCons:120,vm2c:cubDef,fce:1,qtd:1,iptuAt:800});
  const upd=(k,v)=>setEx(p=>({...p,[k]:parseFloat(v)||0}));
  const gleba=ex.area*ex.fi,fg=gleba>2000?fatorGleba(gleba):1.0;
  const vvt=ex.area*ex.face*ex.ft*ex.fp*ex.fl*ex.fi*fg,vve=ex.areaCons*ex.vm2c*ex.fce,vviBruto=vvt+vve;
  const dBeff=params.descBruto===0?100:params.descBruto,vviDesc=vviBruto*(dBeff/100);
  const dUnit=params.descPredial/Math.max(ex.qtd,1),vviUtil=Math.max(vviDesc-dUnit,0);
  const isPred=ex.areaCons>0,aliq=isPred?params.aliqPredial:params.aliqTerritorial;
  let iptuSim=vviUtil*aliq/100,teto=false;
  if(ex.iptuAt>0&&params.limiteAumento>0){const tv=ex.iptuAt*(1+params.limiteAumento/100);if(iptuSim>tv){iptuSim=tv;teto=true;}}
  const varP=ex.iptuAt>0?((iptuSim-ex.iptuAt)/ex.iptuAt)*100:0;

  const STEPS=[
    {n:"1",t:"VVT",f:"Área × Face × FT × FP × FL × FI × FGleba",r:fmtBRL(vvt),d:`${ex.area}×${ex.face}×${ex.ft}×${ex.fp}×${ex.fl}×${ex.fi}×${fg}=${fmtBRL(vvt)}`},
    {n:"2",t:"Fator Gleba",f:"≤2.000→1,0 | 2.001–4.000→0,6 | 4.001–10.000→0,5 | 10.001–20.000→0,4 | 20.001–50.000→0,25 | >50.000→0,20",r:`${fg}`,d:`Gleba: ${fmtNum(gleba)} m²${gleba>2000?" → reduzido":" → sem redução"}`},
    {n:"3",t:"VVE",f:"Área Construída × VM2C × FCE",r:fmtBRL(vve),d:`${ex.areaCons}×${fmtBRL(ex.vm2c)}×${ex.fce}=${fmtBRL(vve)}`},
    {n:"4",t:"VVI Bruto",f:"VVT + VVE",r:fmtBRL(vviBruto),d:`${fmtBRL(vvt)}+${fmtBRL(vve)}=${fmtBRL(vviBruto)}`},
    {n:"5",t:`VVI c/ Desc. Bruto (${dBeff}%)`,f:"VVI × (DESC_BRUTO÷100)",r:fmtBRL(vviDesc),d:`${fmtBRL(vviBruto)}×${dBeff/100}=${fmtBRL(vviDesc)}`},
    {n:"6",t:"Desc. Predial/Unidade",f:"DESC_PREDIAL ÷ QTD_UNIDADES",r:fmtBRL(dUnit),d:`R$${params.descPredial}÷${ex.qtd}=${fmtBRL(dUnit)}`},
    {n:"7",t:"VVI Utilizado",f:"VVI c/ Desc. − Desc./Unid.",r:fmtBRL(vviUtil),d:`${fmtBRL(vviDesc)}−${fmtBRL(dUnit)}=${fmtBRL(vviUtil)}`},
    {n:"8",t:`IPTU ${isPred?"Predial":"Territorial"}`,f:`VVI Utilizado × ${aliq}%`,r:fmtBRL(vviUtil*aliq/100),d:`${fmtBRL(vviUtil)}×${aliq/100}=${fmtBRL(vviUtil*aliq/100)}`},
    {n:"9",t:"Limite de Aumento",f:`Atual × (1 + ${params.limiteAumento}%)`,r:ex.iptuAt>0?fmtBRL(ex.iptuAt*(1+params.limiteAumento/100)):"N/A",d:teto?"⚠ Teto atingido":ex.iptuAt===0?"Não se aplica":"Sem teto"},
    {n:"10",t:"IPTU Final",f:teto?"Teto aplicado":"Calculado",r:fmtBRL(iptuSim),d:`Variação: ${fmtPct(varP)}`},
  ];

  return(
    <div style={{display:"flex",gap:22}}>
      <div style={{width:230,flexShrink:0}}>
        <div style={{background:"var(--card)",borderRadius:14,padding:16,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Exemplo Interativo</div>
          {[["Área Terreno (m²)","area"],["Face Quadra (R$/m²)","face"],["Fração Ideal","fi"],["FT","ft"],["FP","fp"],["FL","fl"],["Área Construída (m²)","areaCons"],["VM2C (R$/m²)","vm2c"],["FCE","fce"],["Qtd. Unidades","qtd"],["IPTU Atual (R$)","iptuAt"]].map(([l,k])=>(
            <Inp key={k} label={l} type="number" step="any" value={ex[k]} onChange={v=>upd(k,v)}/>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
        {STEPS.map((s,i)=>(
          <div key={i} style={{background:"var(--card)",borderRadius:12,padding:"14px 18px",boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{background:C.light,color:C.primary,borderRadius:6,padding:"1px 8px",fontSize:11,fontWeight:800}}>{s.n}</span>
                <span style={{fontWeight:700,fontSize:13}}>{s.t}</span>
              </div>
              <div style={{fontSize:11,color:"var(--muted)",marginBottom:2,fontFamily:"monospace"}}>{s.f}</div>
              <div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>{s.d}</div>
            </div>
            <div style={{background:i===STEPS.length-1?C.primary:C.light,color:i===STEPS.length-1?"white":C.primary,borderRadius:9,padding:"8px 14px",fontWeight:800,fontSize:14,flexShrink:0}}>{s.r}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// ABA 6 — Exportar SQL  (v3.0 — CRUD-first, sem trigger)
// ══════════════════════════════════════════════════════════════════════════════
function TabSQL({params}){
  const [schema,setSchema]=useState("gestao_cadastro_imobiliario");
  const [activeTab,setActiveTab]=useState("estrutura"); // "estrutura" | "functions" | "crud"
  const [copied,setCopied]=useState(false);
  const today=new Date().toLocaleDateString("pt-BR");
  const cubCoefVal=params.cubCoef==="min"?params.cubMin:params.cubCoef==="max"?params.cubMax:params.cubMed;

  // ── SQL 1: Estrutura (tabelas) ─────────────────────────────────────────────
  const sqlEstrutura=`-- ================================================================
-- ValorFiscal — Estrutura de Tabelas
-- Município : ${params.municipio}
-- Schema    : ${schema}
-- Gerado em : ${today}
-- Versão    : 3.0
-- ================================================================
-- ESTRATÉGIA: CRUD-first (sem triggers)
-- Os cálculos são disparados explicitamente pela aplicação,
-- garantindo controle total sobre quando e como o PGV é recalculado.
-- ================================================================

-- 0. Schema (caso não exista)
CREATE SCHEMA IF NOT EXISTS ${schema};

-- ----------------------------------------------------------------
-- 1. Parâmetros tributários municipais
--    Centraliza alíquotas, CUB e descontos em uma única tabela.
--    Quando a lei municipal mudar, basta fazer UPDATE aqui —
--    sem redeployar nada, sem mexer em triggers.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ${schema}.parametros_tributarios (
  id                  SERIAL PRIMARY KEY,
  municipio           TEXT    NOT NULL DEFAULT '${params.municipio}',
  aliq_territorial    NUMERIC(6,4) NOT NULL DEFAULT ${params.aliqTerritorial},
  aliq_predial        NUMERIC(6,4) NOT NULL DEFAULT ${params.aliqPredial},
  desc_bruto_pct      NUMERIC(6,4) NOT NULL DEFAULT ${params.descBruto === 0 ? 100 : params.descBruto},
  desc_predial_rs     NUMERIC(12,2) NOT NULL DEFAULT ${params.descPredial},
  limite_aumento_pct  NUMERIC(6,4) NOT NULL DEFAULT ${params.limiteAumento},
  cub_rs_m2           NUMERIC(10,2) NOT NULL DEFAULT ${params.cub},
  cub_coef            NUMERIC(6,4) NOT NULL DEFAULT ${cubCoefVal},
  vigencia_inicio     DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim        DATE,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ${schema}.parametros_tributarios IS
  'Parâmetros tributários municipais. Sempre leia o registro com ativo=TRUE e vigencia_inicio mais recente.';

-- Seed inicial com os parâmetros atuais do simulador
INSERT INTO ${schema}.parametros_tributarios (
  municipio, aliq_territorial, aliq_predial,
  desc_bruto_pct, desc_predial_rs, limite_aumento_pct,
  cub_rs_m2, cub_coef
) VALUES (
  '${params.municipio}',
  ${params.aliqTerritorial}, ${params.aliqPredial},
  ${params.descBruto === 0 ? 100 : params.descBruto}, ${params.descPredial},
  ${params.limiteAumento}, ${params.cub}, ${cubCoefVal}
) ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 2. Resultado do cálculo PGV por imóvel
--    Gravado via CRUD pela aplicação — nunca por trigger.
--    Cada recálculo gera um novo registro (histórico completo).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ${schema}.pgv_resultado (
  id              SERIAL PRIMARY KEY,
  inscricao       TEXT    NOT NULL,
  exercicio       INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  area_terreno    NUMERIC(12,4),
  area_construida NUMERIC(12,4),
  face_quadra     NUMERIC(12,4),
  fracao_ideal    NUMERIC(8,6) DEFAULT 1,
  vm2c            NUMERIC(12,2),
  ft              NUMERIC(6,4) DEFAULT 1,
  fp              NUMERIC(6,4) DEFAULT 1,
  fl              NUMERIC(6,4) DEFAULT 1,
  fce             NUMERIC(6,4) DEFAULT 1,
  fator_gleba     NUMERIC(6,4) DEFAULT 1,
  vvt             NUMERIC(14,2) NOT NULL DEFAULT 0,
  vve             NUMERIC(14,2) NOT NULL DEFAULT 0,
  vvi_bruto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vvi_utilizado   NUMERIC(14,2) NOT NULL DEFAULT 0,
  iptu_atual      NUMERIC(12,2) DEFAULT 0,
  iptu_simulado   NUMERIC(12,2) NOT NULL DEFAULT 0,
  variacao_pct    NUMERIC(8,2)  DEFAULT 0,
  teto_atingido   BOOLEAN NOT NULL DEFAULT FALSE,
  is_predial      BOOLEAN NOT NULL DEFAULT FALSE,
  aliq_aplicada   NUMERIC(6,4),
  id_parametro    INTEGER REFERENCES ${schema}.parametros_tributarios(id),
  origem          TEXT DEFAULT 'simulador',  -- 'simulador' | 'lote' | 'api' | 'recadastro'
  calculado_em    TIMESTAMP NOT NULL DEFAULT NOW(),
  calculado_por   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pgv_inscricao
  ON ${schema}.pgv_resultado(inscricao);
CREATE INDEX IF NOT EXISTS idx_pgv_exercicio
  ON ${schema}.pgv_resultado(exercicio);
CREATE INDEX IF NOT EXISTS idx_pgv_inscricao_exercicio
  ON ${schema}.pgv_resultado(inscricao, exercicio);

COMMENT ON TABLE ${schema}.pgv_resultado IS
  'Resultados do cálculo PGV/IPTU. Gravado via CRUD pela aplicação. ';
COMMENT ON COLUMN ${schema}.pgv_resultado.origem IS
  'simulador=interface web, lote=upload CSV, api=integração, recadastro=atualização cadastral';
`;

  // ── SQL 2: Functions ───────────────────────────────────────────────────────
  const sqlFunctions=`-- ================================================================
-- ValorFiscal — Functions PGV/IPTU
-- Município : ${params.municipio}
-- Schema    : ${schema}
-- Gerado em : ${today}
-- Versão    : 3.0
-- ================================================================

-- ----------------------------------------------------------------
-- F1: Lê parâmetros ativos do banco (não hardcoded)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.__params_ativos()
RETURNS ${schema}.parametros_tributarios LANGUAGE plpgsql STABLE AS $$
DECLARE v_row ${schema}.parametros_tributarios;
BEGIN
  SELECT * INTO v_row FROM ${schema}.parametros_tributarios
  WHERE ativo = TRUE
    AND vigencia_inicio <= CURRENT_DATE
    AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
  ORDER BY vigencia_inicio DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[ValorFiscal] Nenhum parâmetro tributário ativo encontrado em ${schema}.parametros_tributarios';
  END IF;
  RETURN v_row;
END; $$;

-- ----------------------------------------------------------------
-- F2: Cálculo do CUB para área construída
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.__calculo_cub(p_area_construida NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE v_p ${schema}.parametros_tributarios;
BEGIN
  v_p := ${schema}.__params_ativos();
  RETURN COALESCE(p_area_construida, 0) * v_p.cub_rs_m2 * v_p.cub_coef;
END; $$;

-- ----------------------------------------------------------------
-- F3: Motor de cálculo PGV/IPTU (lê parâmetros do banco)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.__calculo_pgv(
  p_area_terreno    NUMERIC,
  p_face_quadra     NUMERIC,
  p_fracao_ideal    NUMERIC  DEFAULT 1,
  p_area_construida NUMERIC  DEFAULT 0,
  p_vm2c            NUMERIC  DEFAULT NULL,
  p_qtd_unidades    INTEGER  DEFAULT 1,
  p_ft              NUMERIC  DEFAULT 1,
  p_fp              NUMERIC  DEFAULT 1,
  p_fl              NUMERIC  DEFAULT 1,
  p_fce             NUMERIC  DEFAULT 1,
  p_iptu_atual      NUMERIC  DEFAULT 0
) RETURNS TABLE(
  vvt           NUMERIC,
  vve           NUMERIC,
  vvi_bruto     NUMERIC,
  vvi_utilizado NUMERIC,
  iptu_simulado NUMERIC,
  variacao_pct  NUMERIC,
  teto_atingido BOOLEAN,
  fator_gleba   NUMERIC,
  is_predial    BOOLEAN,
  aliq_aplicada NUMERIC,
  id_parametro  INTEGER
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_p   ${schema}.parametros_tributarios;
  v_gleba NUMERIC; v_fg NUMERIC := 1.0;
  v_vvt NUMERIC := 0; v_vve NUMERIC := 0; v_vvi NUMERIC;
  v_util NUMERIC; v_iptu NUMERIC; v_teto BOOLEAN := FALSE; v_var NUMERIC := 0;
  v_vm2c NUMERIC; v_is_pred BOOLEAN; v_aliq NUMERIC;
BEGIN
  -- Lê parâmetros do banco — nunca hardcoded
  v_p := ${schema}.__params_ativos();

  -- VVT
  IF COALESCE(p_area_terreno, 0) > 0 AND COALESCE(p_face_quadra, 0) > 0 THEN
    v_gleba := p_area_terreno * COALESCE(p_fracao_ideal, 1);
    IF v_gleba > 2000 THEN
      v_fg := CASE
        WHEN v_gleba <= 4000  THEN 0.6
        WHEN v_gleba <= 10000 THEN 0.5
        WHEN v_gleba <= 20000 THEN 0.4
        WHEN v_gleba <= 50000 THEN 0.25
        ELSE 0.20
      END;
    END IF;
    v_vvt := p_area_terreno * p_face_quadra
           * COALESCE(p_ft, 1) * COALESCE(p_fp, 1) * COALESCE(p_fl, 1)
           * COALESCE(p_fracao_ideal, 1) * v_fg;
  END IF;

  -- VVE
  IF COALESCE(p_area_construida, 0) > 0 THEN
    v_vm2c := COALESCE(p_vm2c,
      ${schema}.__calculo_cub(p_area_construida) / NULLIF(p_area_construida, 0));
    v_vve := p_area_construida * v_vm2c * COALESCE(p_fce, 1);
  END IF;

  -- VVI e descontos
  v_vvi  := v_vvt + v_vve;
  v_util := GREATEST(
    (v_vvi * (v_p.desc_bruto_pct / 100.0))
    - (v_p.desc_predial_rs / GREATEST(COALESCE(p_qtd_unidades, 1), 1)),
    0
  );

  -- Alíquota
  v_is_pred := COALESCE(p_area_construida, 0) > 0;
  v_aliq    := CASE WHEN v_is_pred THEN v_p.aliq_predial ELSE v_p.aliq_territorial END;
  v_iptu    := v_util * v_aliq / 100.0;

  -- Teto de aumento
  IF COALESCE(p_iptu_atual, 0) > 0 AND v_p.limite_aumento_pct > 0 THEN
    IF v_iptu > p_iptu_atual * (1 + v_p.limite_aumento_pct / 100.0) THEN
      v_iptu := p_iptu_atual * (1 + v_p.limite_aumento_pct / 100.0);
      v_teto := TRUE;
    END IF;
  END IF;

  -- Variação
  IF COALESCE(p_iptu_atual, 0) > 0 THEN
    v_var := ((v_iptu - p_iptu_atual) / p_iptu_atual) * 100.0;
  END IF;

  RETURN QUERY SELECT
    v_vvt, v_vve, v_vvi, v_util, v_iptu, v_var,
    v_teto, v_fg, v_is_pred, v_aliq, v_p.id;
END; $$;

-- ----------------------------------------------------------------
-- F4: Soma IPTU de um imóvel no exercício atual
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.__somar_iptu(p_inscricao TEXT)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(iptu_simulado), 0) INTO v_total
  FROM ${schema}.pgv_resultado
  WHERE inscricao = p_inscricao
    AND exercicio = EXTRACT(YEAR FROM NOW());
  RETURN v_total;
END; $$;

-- ----------------------------------------------------------------
-- F5: Variação percentual entre dois valores
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.__calculo_diferenca_iptu(
  p_atual NUMERIC, p_simulado NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF COALESCE(p_atual, 0) = 0 THEN RETURN NULL; END IF;
  RETURN ROUND(((p_simulado - p_atual) / p_atual) * 100.0, 2);
END; $$;

-- ----------------------------------------------------------------
-- F6: Recalcula e grava resultado via CRUD (sem trigger)
--     Chame esta function na sua aplicação ao salvar/atualizar imóvel
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${schema}.calcular_e_gravar_pgv(
  p_inscricao       TEXT,
  p_area_terreno    NUMERIC,
  p_face_quadra     NUMERIC,
  p_fracao_ideal    NUMERIC  DEFAULT 1,
  p_area_construida NUMERIC  DEFAULT 0,
  p_vm2c            NUMERIC  DEFAULT NULL,
  p_qtd_unidades    INTEGER  DEFAULT 1,
  p_ft              NUMERIC  DEFAULT 1,
  p_fp              NUMERIC  DEFAULT 1,
  p_fl              NUMERIC  DEFAULT 1,
  p_fce             NUMERIC  DEFAULT 1,
  p_iptu_atual      NUMERIC  DEFAULT 0,
  p_origem          TEXT     DEFAULT 'api',
  p_calculado_por   TEXT     DEFAULT NULL
) RETURNS ${schema}.pgv_resultado LANGUAGE plpgsql AS $$
DECLARE
  v_calc  RECORD;
  v_row   ${schema}.pgv_resultado;
BEGIN
  -- Executa o motor de cálculo
  SELECT * INTO v_calc FROM ${schema}.__calculo_pgv(
    p_area_terreno, p_face_quadra, p_fracao_ideal, p_area_construida,
    p_vm2c, p_qtd_unidades, p_ft, p_fp, p_fl, p_fce, p_iptu_atual
  );

  -- Grava o resultado (CRUD — sem trigger)
  INSERT INTO ${schema}.pgv_resultado (
    inscricao, exercicio,
    area_terreno, area_construida, face_quadra, fracao_ideal,
    vm2c, ft, fp, fl, fce, fator_gleba,
    vvt, vve, vvi_bruto, vvi_utilizado,
    iptu_atual, iptu_simulado, variacao_pct, teto_atingido,
    is_predial, aliq_aplicada, id_parametro,
    origem, calculado_por
  ) VALUES (
    p_inscricao, EXTRACT(YEAR FROM NOW()),
    p_area_terreno, p_area_construida, p_face_quadra, p_fracao_ideal,
    COALESCE(p_vm2c, v_calc.vve / NULLIF(p_area_construida, 0)),
    p_ft, p_fp, p_fl, p_fce, v_calc.fator_gleba,
    v_calc.vvt, v_calc.vve, v_calc.vvi_bruto, v_calc.vvi_utilizado,
    p_iptu_atual, v_calc.iptu_simulado, v_calc.variacao_pct, v_calc.teto_atingido,
    v_calc.is_predial, v_calc.aliq_aplicada, v_calc.id_parametro,
    p_origem, p_calculado_por
  ) RETURNING * INTO v_row;

  RETURN v_row;
END; $$;

-- FIM FUNCTIONS — ${params.municipio} — ${today}
`;

  // ── SQL 3: Exemplo de uso CRUD ─────────────────────────────────────────────
  const sqlCrud=`-- ================================================================
-- ValorFiscal — Exemplos de Uso CRUD
-- Município : ${params.municipio}
-- Schema    : ${schema}
-- Gerado em : ${today}
-- ================================================================
-- IMPORTANTE: NUNCA use trigger para disparar __calculo_pgv().
-- Chame calcular_e_gravar_pgv() explicitamente na sua aplicação
-- ao salvar, atualizar ou recadastrar um imóvel.
-- ================================================================

-- ----------------------------------------------------------------
-- EXEMPLO 1: Calcular e gravar um imóvel predial
-- ----------------------------------------------------------------
SELECT * FROM ${schema}.calcular_e_gravar_pgv(
  p_inscricao       := '1.01.001.0001.00',
  p_area_terreno    := 300,
  p_face_quadra     := 800,
  p_fracao_ideal    := 1,
  p_area_construida := 150,
  p_vm2c            := NULL,   -- NULL = usa CUB do banco automaticamente
  p_qtd_unidades    := 1,
  p_ft              := 1.0,    -- Plano
  p_fp              := 1.0,    -- Firme e seco
  p_fl              := 1.0,    -- Meio de quadra
  p_fce             := 0.85,   -- Bom estado de conservação
  p_iptu_atual      := 1200,
  p_origem          := 'recadastro',
  p_calculado_por   := 'sistema_sig'
);

-- ----------------------------------------------------------------
-- EXEMPLO 2: Calcular e gravar um imóvel territorial (sem construção)
-- ----------------------------------------------------------------
SELECT * FROM ${schema}.calcular_e_gravar_pgv(
  p_inscricao       := '1.01.002.0003.00',
  p_area_terreno    := 500,
  p_face_quadra     := 600,
  p_fracao_ideal    := 1,
  p_area_construida := 0,      -- Sem edificação = alíquota territorial
  p_iptu_atual      := 400,
  p_origem          := 'lote',
  p_calculado_por   := 'importacao_csv'
);

-- ----------------------------------------------------------------
-- EXEMPLO 3: Recalcular lote de imóveis via loop (uso em batch)
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_imovel RECORD;
BEGIN
  FOR v_imovel IN
    SELECT inscricao, area_terreno, face_quadra, fracao_ideal,
           area_construida, vm2c, qtd_unidades,
           ft, fp, fl, fce, iptu_atual
    FROM cadastro_imobiliario   -- sua tabela de cadastro
    WHERE recadastrado_em >= CURRENT_DATE - 30  -- apenas os alterados
  LOOP
    PERFORM ${schema}.calcular_e_gravar_pgv(
      p_inscricao       := v_imovel.inscricao,
      p_area_terreno    := v_imovel.area_terreno,
      p_face_quadra     := v_imovel.face_quadra,
      p_fracao_ideal    := v_imovel.fracao_ideal,
      p_area_construida := v_imovel.area_construida,
      p_vm2c            := v_imovel.vm2c,
      p_qtd_unidades    := v_imovel.qtd_unidades,
      p_ft              := v_imovel.ft,
      p_fp              := v_imovel.fp,
      p_fl              := v_imovel.fl,
      p_fce             := v_imovel.fce,
      p_iptu_atual      := v_imovel.iptu_atual,
      p_origem          := 'batch_recadastro',
      p_calculado_por   := current_user
    );
  END LOOP;
  RAISE NOTICE 'Recálculo em lote concluído';
END; $$;

-- ----------------------------------------------------------------
-- EXEMPLO 4: Atualizar parâmetros quando a lei mudar
--            (sem mexer em trigger ou redeployar nada)
-- ----------------------------------------------------------------
-- Desativa parâmetro atual
UPDATE ${schema}.parametros_tributarios
SET ativo = FALSE, vigencia_fim = CURRENT_DATE - 1
WHERE ativo = TRUE;

-- Insere novo parâmetro (ex: reajuste de alíquota predial aprovado em lei)
INSERT INTO ${schema}.parametros_tributarios (
  municipio, aliq_territorial, aliq_predial,
  desc_bruto_pct, desc_predial_rs, limite_aumento_pct,
  cub_rs_m2, cub_coef, vigencia_inicio
) VALUES (
  '${params.municipio}',
  ${params.aliqTerritorial},   -- alíquota territorial (mantida)
  0.60,                         -- alíquota predial (atualizada por lei)
  ${params.descBruto === 0 ? 100 : params.descBruto},
  ${params.descPredial},
  ${params.limiteAumento},
  ${params.cub},
  ${cubCoefVal},
  CURRENT_DATE                  -- vigência a partir de hoje
);
-- A partir deste ponto, qualquer chamada a calcular_e_gravar_pgv()
-- usará automaticamente os novos parâmetros. Zero redeploy.

-- ----------------------------------------------------------------
-- CONSULTAS ÚTEIS
-- ----------------------------------------------------------------

-- Total arrecadado simulado por exercício
SELECT exercicio,
       COUNT(*)                           AS total_imoveis,
       SUM(iptu_atual)                    AS arrecadacao_atual,
       SUM(iptu_simulado)                 AS arrecadacao_simulada,
       SUM(iptu_simulado - iptu_atual)    AS impacto,
       AVG(variacao_pct)                  AS variacao_media_pct,
       SUM(CASE WHEN teto_atingido THEN 1 ELSE 0 END) AS com_teto
FROM ${schema}.pgv_resultado
GROUP BY exercicio ORDER BY exercicio DESC;

-- Histórico de um imóvel específico
SELECT exercicio, iptu_atual, iptu_simulado, variacao_pct,
       teto_atingido, origem, calculado_em
FROM ${schema}.pgv_resultado
WHERE inscricao = '1.01.001.0001.00'
ORDER BY calculado_em DESC;

-- FIM EXEMPLOS CRUD — ${params.municipio} — ${today}
`;

  const sqlMap = { estrutura: sqlEstrutura, functions: sqlFunctions, crud: sqlCrud };
  const currentSql = sqlMap[activeTab];

  const download=()=>{
    const blob=new Blob([currentSql],{type:"text/plain"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`pgv_${activeTab}_${params.municipio.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")}.sql`;a.click();
  };
  const downloadAll=()=>{
    const all=[sqlEstrutura,sqlFunctions,sqlCrud].join("\n\n");
    const blob=new Blob([all],{type:"text/plain"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`pgv_completo_${params.municipio.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")}.sql`;a.click();
  };
  const copy=()=>{navigator.clipboard.writeText(currentSql).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};

  const tabLabels=[
    {id:"estrutura",  label:"1. Tabelas",    sub:"pgv_resultado + parametros_tributarios"},
    {id:"functions",  label:"2. Functions",  sub:"6 functions (lê params do banco)"},
    {id:"crud",       label:"3. Uso CRUD",   sub:"Exemplos sem trigger"},
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Alerta estratégico */}
      <div style={{background:"#EAF3DE",border:"1.5px solid #7BBF4A",borderRadius:12,padding:"12px 18px",fontSize:13,color:"#2D5A0E",display:"flex",gap:10,alignItems:"flex-start"}}>
        <span style={{fontSize:18,flexShrink:0}}>✅</span>
        <div>
          <strong>CRUD-first — sem trigger.</strong> Os parâmetros tributários ficam na tabela <code style={{background:"#D4EDBA",padding:"1px 5px",borderRadius:4}}>parametros_tributarios</code>. Quando a lei mudar, basta um UPDATE — zero redeploy, zero mexer em trigger. O motor <code style={{background:"#D4EDBA",padding:"1px 5px",borderRadius:4}}>calcular_e_gravar_pgv()</code> é chamado explicitamente pela aplicação ao salvar ou atualizar um imóvel.
        </div>
      </div>

      {/* Config */}
      <section style={{background:"var(--card)",borderRadius:14,padding:22,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>Configurações</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><label style={{fontSize:12,fontWeight:600,color:"var(--muted)",display:"block",marginBottom:4}}>Município</label><div style={{padding:"8px 12px",background:"var(--row-alt)",borderRadius:8,fontSize:13,fontWeight:600,border:"1.5px solid var(--border)"}}>{params.municipio}</div></div>
          <Inp label="Schema PostgreSQL" value={schema} onChange={setSchema}/>
        </div>
        <div style={{marginTop:14,display:"flex",gap:10,flexWrap:"wrap"}}>
          {[["Alíq. Predial",`${params.aliqPredial}%`],["Alíq. Territorial",`${params.aliqTerritorial}%`],["Desc. Bruto",`${params.descBruto===0?"100(auto)":params.descBruto}%`],["Desc. Predial",fmtBRL(params.descPredial)],["Limite",`${params.limiteAumento}%`],["CUB",fmtBRL(params.cub)],["Coef.",`${params.cubCoef}(${cubCoefVal})`]].map(([l,v])=>(
            <div key={l} style={{background:"var(--row-alt)",borderRadius:8,padding:"6px 12px",fontSize:12}}><span style={{color:"var(--muted)"}}>{l}: </span><span style={{fontWeight:700}}>{v}</span></div>
          ))}
        </div>
      </section>

      {/* Sub-tabs */}
      <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {tabLabels.map(t=>(
            <button key={t.id} onClick={()=>{setActiveTab(t.id);setCopied(false);}}
              style={{display:"flex",flexDirection:"column",alignItems:"flex-start",padding:"8px 14px",borderRadius:9,border:`1.5px solid ${activeTab===t.id?C.primary:"var(--border)"}`,background:activeTab===t.id?C.light:"transparent",cursor:"pointer",minWidth:160}}>
              <span style={{fontWeight:700,fontSize:12,color:activeTab===t.id?C.primary:"var(--text)"}}>{t.label}</span>
              <span style={{fontSize:10,color:"var(--muted)",marginTop:1}}>{t.sub}</span>
            </button>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10}}>
          <div style={{fontWeight:700,fontSize:13}}>
            {activeTab==="estrutura"&&"Tabelas — pgv_resultado + parametros_tributarios"}
            {activeTab==="functions"&&"6 Functions PostgreSQL (leem params do banco)"}
            {activeTab==="crud"&&"Exemplos de uso CRUD — sem trigger"}
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn icon={copied?"check":"copy"} outline color={copied?C.green:C.primary} small onClick={copy}>{copied?"Copiado!":"Copiar"}</Btn>
            <Btn icon="download" small onClick={download}>Este arquivo</Btn>
            <Btn icon="download" color={C.green} small onClick={downloadAll}>Tudo (.sql)</Btn>
          </div>
        </div>

        <pre style={{background:"var(--code-bg)",borderRadius:10,padding:18,fontSize:11,lineHeight:1.65,overflowX:"auto",overflowY:"auto",maxHeight:520,color:"var(--code-text)",margin:0,fontFamily:"'Fira Code','Cascadia Code','Consolas',monospace",whiteSpace:"pre"}}>{currentSql}</pre>
      </section>

      {/* Ordem de execução */}
      <section style={{background:"var(--card)",borderRadius:14,padding:20,boxShadow:"0 1px 6px var(--shadow)",border:"1.5px solid var(--border)"}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Ordem de execução no banco</div>
        {[
          {n:"1",t:"Tabelas",c:"Execute o SQL da aba Tabelas primeiro — cria pgv_resultado e parametros_tributarios com os valores atuais do simulador."},
          {n:"2",t:"Functions",c:"Execute o SQL da aba Functions — as 6 functions já leem os parâmetros do banco, não têm valores hardcoded."},
          {n:"3",t:"Integrar na aplicação",c:"Na sua API/backend, substitua qualquer trigger por uma chamada explícita a calcular_e_gravar_pgv() ao salvar ou atualizar um imóvel."},
          {n:"4",t:"Mudança de lei",c:"Quando alíquotas ou CUB mudarem: desative o registro atual em parametros_tributarios e insira o novo. Zero redeploy."},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<3?"1px solid var(--border)":"none"}}>
            <div style={{background:C.light,color:C.primary,borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0}}>{s.n}</div>
            <div><div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{s.t}</div><div style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{s.c}</div></div>
          </div>
        ))}
      </section>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════════════════
const NAV=[
  {id:"dashboard",   label:"Dashboard",     icon:"dashboard"},
  {id:"parametros",  label:"Parâmetros",    icon:"settings"},
  {id:"simulador",   label:"Simulador",     icon:"calculator"},
  {id:"lote",        label:"Lote",          icon:"table"},
  {id:"detalhamento",label:"Detalhamento",  icon:"book"},
  {id:"sql",         label:"Exportar SQL",  icon:"code"},
];
const TITLES={dashboard:"Dashboard",parametros:"Parâmetros Tributários",simulador:"Simulador Individual",lote:"Simulação em Lote",detalhamento:"Detalhamento do Cálculo",sql:"Exportar Functions SQL"};

export default function App(){
  const [dark,setDark]=useState(false);
  const [tab,setTab]=useState("dashboard");
  const [params,setParams]=useState(DEFAULT_PARAMS);
  const [lote,setLote]=useState([]);

  const theme=dark?{
    "--bg":"#0E0E1C","--sidebar":"#14142A","--card":"#1B1B30",
    "--text":"#E6E6F2","--muted":"#8080A8","--border":"#2A2A48",
    "--input-bg":"#10101E","--row-alt":"#17172C",
    "--shadow":"rgba(0,0,0,.45)","--code-bg":"#09090F","--code-text":"#88D0F8",
  }:{
    "--bg":"#F2F2FA","--sidebar":"#FFFFFF","--card":"#FFFFFF",
    "--text":"#1A1A30","--muted":"#6B6B8A","--border":"#E0DFEF",
    "--input-bg":"#F8F8FD","--row-alt":"#F5F5FC",
    "--shadow":"rgba(83,74,183,.08)","--code-bg":"#1A1A2E","--code-text":"#7EC8EA",
  };

  return(
    <div style={{display:"flex",height:"100vh",fontFamily:"'Inter','Segoe UI',sans-serif",...theme,background:"var(--bg)",color:"var(--text)",overflow:"hidden"}}>
      <div style={{width:216,background:"var(--sidebar)",borderRight:"1.5px solid var(--border)",display:"flex",flexDirection:"column",padding:"20px 10px 16px",gap:2,flexShrink:0}}>
        <div style={{paddingLeft:8,marginBottom:22}}><Logo/></div>
        <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:1.5,padding:"3px 10px",marginBottom:4}}>NAVEGAÇÃO</div>
        {NAV.map(nav=>{
          const active=tab===nav.id;
          return(
            <button key={nav.id} onClick={()=>setTab(nav.id)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:active?700:500,fontSize:13,textAlign:"left",background:active?C.light:"transparent",color:active?C.primary:"var(--text)",transition:"background .15s,color .15s"}}>
              <Icon name={nav.icon} size={18} color={active?C.primary:"var(--muted)"}/>
              {nav.label}
              {nav.id==="lote"&&lote.length>0&&(
                <span style={{marginLeft:"auto",background:C.primary,color:"white",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{lote.length}</span>
              )}
            </button>
          );
        })}
        <div style={{flex:1}}/>
        <div style={{borderTop:"1px solid var(--border)",paddingTop:12,display:"flex",alignItems:"center",gap:8,paddingLeft:4}}>
          <div style={{flex:1,fontSize:11,color:"var(--muted)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{params.municipio}</div>
          <button onClick={()=>setDark(d=>!d)} style={{background:"var(--row-alt)",border:"1.5px solid var(--border)",borderRadius:8,padding:"5px 7px",cursor:"pointer",display:"flex",alignItems:"center"}}>
            <Icon name={dark?"sun":"moon"} size={15} color="var(--muted)"/>
          </button>
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"14px 28px",borderBottom:"1.5px solid var(--border)",background:"var(--card)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontWeight:800,fontSize:17,lineHeight:1.1}}>{TITLES[tab]}</div>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{params.municipio} · ValorFiscal PGV/IPTU</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {lote.length>0&&<Badge label={`${lote.length} no lote`} color={C.primary} bg={C.light}/>}
            <button onClick={()=>setTab("parametros")} style={{background:"var(--row-alt)",border:"1.5px solid var(--border)",borderRadius:9,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",color:"var(--text)",display:"flex",alignItems:"center",gap:6}}>
              <Icon name="settings" size={14} color="var(--muted)"/> Parâmetros
            </button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"22px 28px"}}>
          {tab==="dashboard"    &&<TabDashboard  lote={lote}/>}
          {tab==="parametros"   &&<TabParametros params={params} setParams={setParams}/>}
          {tab==="simulador"    &&<TabSimulador  params={params} onAddLote={im=>setLote(l=>[...l,im])}/>}
          {tab==="lote"         &&<TabLote       params={params} lote={lote} setLote={setLote}/>}
          {tab==="detalhamento" &&<TabDetalhamento params={params}/>}
          {tab==="sql"          &&<TabSQL          params={params}/>}
        </div>
      </div>
    </div>
  );
}
