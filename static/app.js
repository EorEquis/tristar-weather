const $=id=>document.getElementById(id);
const number=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d);
const mph=v=>v==null?null:v*2.2369362921;
const inhg=v=>v==null?null:v*0.0295299830714;
const cardinal=d=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((d%360)+360)%360/22.5)%16];
const zone='America/Chicago';
function setCurrent(o){
 if(!o){$('status').textContent='NO DATA';return;}
 $('temp').textContent=number(o.bme_temp_c)+' °C';$('dew').textContent='Dew point '+number(o.dew_point_c)+' °C';
 $('humidity').textContent=number(o.humidity_pct,0)+'%';$('pressure').textContent=number(inhg(o.pressure_hpa),2)+' inHg';
 $('sky').textContent=number(o.sky_temperature_c)+' °C';$('ground').textContent=number(o.ground_temperature_c)+' °C';
 $('rain').textContent=number(o.rain_daily_mm,2)+' mm';$('rainbig').textContent=number(o.rain_daily_mm,2);
 $('rainrate').textContent='Rate '+number(o.rain_rate_mm_hr,2)+' mm/hr';$('rainhour').textContent=number(o.rain_hourly_mm,2)+' mm';
 $('rate').textContent=number(o.rain_rate_mm_hr,2)+' mm/hr';
 $('wind').textContent=number(mph(o.wind_speed_mps),1);
 $('direction').textContent=o.wind_dir_deg==null?'Direction unavailable':cardinal(o.wind_dir_deg)+' · '+number(o.wind_dir_deg,1)+'°';
 $('needle').setAttribute('transform','rotate('+(o.wind_dir_deg??0)+' 120 120)');
 $('needle').style.opacity=o.wind_dir_deg==null?'0.2':'1';
 $('gust10').textContent='10-min gust '+number(mph(o.wind_gust_10min),1)+' mph';
 $('gusthour').textContent='Hour gust '+number(mph(o.wind_gust_hour),1)+' mph';
 $('gusttoday').textContent='Today gust '+number(mph(o.wind_gust_today),1)+' mph';
 const stamp=new Date(o.timestamp),age=Date.now()-stamp.getTime();
 $('updated').textContent='Last observation: '+stamp.toLocaleString('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'medium'})+' (station local)';
 $('status').textContent=age<180000?'● LIVE':'● STALE';$('status').className='status '+(age<180000?'live':'stale');
}
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;}
function chart(id,rows,series){
 const root=$(id);root.replaceChildren();
 const valid=rows.filter(r=>series.some(s=>Number.isFinite(Number(r[s.key]))&&r[s.key]!=null));
 if(valid.length<2){const e=document.createElement('div');e.className='chart-empty';e.textContent='Not enough observations';root.append(e);return;}
 const w=500,h=210,l=55,r=12,t=12,b=28;
 const times=valid.map(x=>Date.parse(x.timestamp)),minX=Math.min(...times),maxX=Math.max(...times);
 const values=valid.flatMap(row=>series.map(s=>row[s.key]==null?null:s.convert? s.convert(row[s.key]):row[s.key])).filter(v=>v!=null&&Number.isFinite(v));
 if(!values.length||minX===maxX)return;
 let lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo)*.12||1;lo-=pad;hi+=pad;
 const x=v=>l+(v-minX)/(maxX-minX)*(w-l-r),y=v=>h-b-(v-lo)/(hi-lo)*(h-t-b);
 const svg=node('svg',{viewBox:'0 0 500 210',preserveAspectRatio:'none',role:'img','aria-label':id.replace('chart-','')+' historical trend'});
 for(let i=0;i<4;i++){const yy=t+i*(h-t-b)/3;svg.append(node('line',{x1:l,y1:yy,x2:w-r,y2:yy,stroke:'#25384d','stroke-dasharray':'4 5'}));svg.append(node('text',{x:3,y:yy+4},(hi-(hi-lo)*i/3).toFixed(2)));}
 const fmt=ms=>new Date(ms).toLocaleString('en-US',{timeZone:zone,month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
 svg.append(node('text',{x:l,y:h-5},fmt(minX)));svg.append(node('text',{x:w-r,y:h-5,'text-anchor':'end'},fmt(maxX)));
 for(const s of series){let path='',drawing=false,previous=null;
 for(const row of valid){const raw=row[s.key],v=raw==null?null:(s.convert?s.convert(raw):raw),time=Date.parse(row.timestamp);
 if(v==null||!Number.isFinite(v)){drawing=false;continue;}
 // Do not bridge missing data or significant time gaps.
 if(previous!=null&&time-previous>Math.max(900000,(maxX-minX)/valid.length*4))drawing=false;
 path+=(drawing?'L':'M')+x(time).toFixed(2)+' '+y(v).toFixed(2)+' ';drawing=true;previous=time;}
 svg.append(node('path',{d:path,stroke:s.color,'stroke-width':2.5,fill:'none','vector-effect':'non-scaling-stroke'}));}
 root.append(svg);
}
let activeRange='today';
async function refreshCurrent(){try{const r=await fetch('/api/current',{cache:'no-store'});if(!r.ok)throw Error('Database unavailable');setCurrent((await r.json()).observation);$('error').textContent='';}catch(e){$('status').textContent='● OFFLINE';$('status').className='status stale';$('error').textContent='Current conditions unavailable: '+e.message;}}
async function refreshHistory(){try{const r=await fetch('/api/history?range='+activeRange,{cache:'no-store'});if(!r.ok)throw Error('Database unavailable');const data=await r.json();if(data.range!==activeRange)return;const rows=data.observations;
 chart('chart-temp',rows,[{key:'bme_temp_c',color:'#80c6e8'},{key:'dew_point_c',color:'#8de5b5'}]);
 chart('chart-pressure',rows,[{key:'pressure_hpa',color:'#80c6e8',convert:inhg}]);
 chart('chart-rain',rows,[{key:'rain_daily_mm',color:'#8de5b5'}]);
 }catch(e){for(const id of ['chart-temp','chart-pressure','chart-rain'])$(id).textContent='History unavailable: '+e.message;}}
document.querySelectorAll('[data-range]').forEach(btn=>btn.addEventListener('click',()=>{activeRange=btn.dataset.range;document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b===btn));refreshHistory();}));
refreshCurrent();refreshHistory();setInterval(refreshCurrent,30000);setInterval(refreshHistory,300000);
