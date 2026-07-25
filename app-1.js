'use strict';
  const LANES=12, TPM=384, STORAGE='musicgame-scoremaker-project-v08';
  const guides=[4,8,12,16,24,32,48,64,96,128,192];
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const deep=v=>JSON.parse(JSON.stringify(v));
  let project={version:1,title:'Overdose / 譜面案',bpm:118,numerator:4,denominator:4,measures:62,guide:8,offset:0,measureHeight:320,notes:[],transferDone:{}};
  let selectedIds=new Set(), activeType='tap', editTool='draw', mode='capture', running=false, externalStart=0, externalBase=0, raf=0, currentTime=0, audioUrl=null, pendingLong=null;
  let history=[],future=[],drag=null,rangeDrag=null,erasing=false,eraseChanged=false,saveTimer=null,referenceUrls=[];

  const els={stage:$('#stage'),wrap:$('#scoreWrap'),canvas:$('#gridCanvas'),layer:$('#notesLayer'),playhead:$('#playhead'),selectionBox:$('#selectionBox'),audio:$('#audio'),toast:$('#toast')};
  const ctx=els.canvas.getContext('2d');

  function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(els.toast._t);els.toast._t=setTimeout(()=>els.toast.classList.remove('show'),1700)}
  function formatTime(sec){sec=Math.max(0,Number(sec)||0);const m=Math.floor(sec/60),s=Math.floor(sec%60),ms=Math.floor((sec%1)*1000);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`}
  function measureSeconds(){return 60/project.bpm*project.numerator*(4/project.denominator)}
  function guideTick(){return TPM/project.guide}
  function snapTick(tick){return clamp(Math.round(tick/guideTick())*guideTick(),0,project.measures*TPM)}
  function rawTimeToTick(sec){return clamp((sec-project.offset)/measureSeconds()*TPM,0,project.measures*TPM)}
  function timeToTick(sec){return snapTick(rawTimeToTick(sec))}
  function tickToTime(tick){return project.offset+tick/TPM*measureSeconds()}
  function tickParts(tick){tick=clamp(Math.round(tick),0,project.measures*TPM);let measure=Math.floor(tick/TPM)+1,inside=tick%TPM;if(measure>project.measures){measure=project.measures;inside=TPM}return {measure,step:Math.round(inside/guideTick())}}
  function partsToTick(measure,step){measure=clamp(Math.round(measure)||1,1,project.measures);step=clamp(Math.round(step)||0,0,project.guide);let tick=(measure-1)*TPM+step*guideTick();return snapTick(tick)}
  function totalHeight(){return project.measures*project.measureHeight}
  function tickToBottom(tick){return tick/TPM*project.measureHeight}
  function bottomToTick(bottom){return snapTick(bottom/project.measureHeight*TPM)}
  function noteStart(n){return n.start||n}
  function selectedNotes(){return project.notes.filter(n=>selectedIds.has(n.id))}
  function selected(){const list=selectedNotes();return list.length===1?list[0]:null}
  function clearSelection(render=true){selectedIds.clear();if(render)renderNotes()}
  function selectOnly(id,render=true){selectedIds=new Set(id?[id]:[]);if(render)renderNotes()}
  function toggleSelection(id,render=true){selectedIds.has(id)?selectedIds.delete(id):selectedIds.add(id);if(render)renderNotes()}
  function normalizePoint(p){p.tick=snapTick(p.tick);p.lane=clamp(Math.round(p.lane),0,LANES-1);p.width=clamp(Math.round(p.width),1,LANES-p.lane);return p}
  function normalizeNote(n){normalizePoint(noteStart(n));if(n.type==='long'){n.end=n.end||deep(n.start);normalizePoint(n.end);if(n.end.tick<n.start.tick){const t=n.start;n.start=n.end;n.end=t}}return n}

  function pushHistory(){history.push(deep(project.notes));if(history.length>80)history.shift();future=[];updateUndo();}
  function undo(){if(!history.length)return;future.push(deep(project.notes));project.notes=history.pop();selectedIds.clear();renderAll();scheduleSave();updateUndo()}
  function redo(){if(!future.length)return;history.push(deep(project.notes));project.notes=future.pop();selectedIds.clear();renderAll();scheduleSave();updateUndo()}
  function updateUndo(){$('#undoBtn').disabled=!history.length;$('#redoBtn').disabled=!future.length}

  function scheduleSave(){clearTimeout(saveTimer);$('#saveStatus').textContent='変更あり…';saveTimer=setTimeout(saveLocal,500)}
  function saveLocal(){syncSettingsFromUI(false);try{localStorage.setItem(STORAGE,JSON.stringify(project));$('#saveStatus').textContent=`端末内保存済み ${new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}`}catch(e){$('#saveStatus').textContent='端末内保存不可（JSON保存は利用可能）'}}
  function loadLocal(){try{const raw=localStorage.getItem(STORAGE);if(raw){project={...project,...JSON.parse(raw)};project.notes=(project.notes||[]).map(normalizeNote);return true}}catch(e){}return false}

  function syncUIFromProject(){
    $('#titleInput').value=project.title;$('#bpmInput').value=project.bpm;$('#measureInput').value=project.measures;$('#numeratorInput').value=project.numerator;$('#denominatorInput').value=project.denominator;$('#offsetInput').value=project.offset;$('#guideSelect').value=project.guide;$('#transferMeasureInput').max=project.measures;$('#jumpMeasureInput').max=project.measures;$('#zoomText').textContent=`${project.measureHeight}px/小節`;
  }
  function syncSettingsFromUI(redraw=true){
    const oldH=project.measureHeight,oldM=project.measures;
    project.title=$('#titleInput').value.trim()||'無題';project.bpm=clamp(Number($('#bpmInput').value)||120,1,999);project.measures=clamp(Math.round(Number($('#measureInput').value)||1),1,300);project.numerator=clamp(Math.round(Number($('#numeratorInput').value)||4),1,16);project.denominator=Number($('#denominatorInput').value)||4;project.offset=Number($('#offsetInput').value)||0;project.guide=Number($('#guideSelect').value)||8;
    project.notes=project.notes.filter(n=>noteStart(n).tick<=project.measures*TPM).map(normalizeNote);
    if(redraw&&(oldH!==project.measureHeight||oldM!==project.measures||true))renderAll();scheduleSave();
  }

  function resizeCanvas(){const w=Math.max(600,Math.round(els.wrap.clientWidth)),h=Math.round(totalHeight());els.wrap.style.height=`${h}px`;els.canvas.width=w;els.canvas.height=h;drawGrid()}
  function drawGrid(){
    const w=els.canvas.width,h=els.canvas.height,mh=project.measureHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#141c33';ctx.fillRect(0,0,w,h);
    for(let lane=0;lane<=LANES;lane++){const x=Math.round(lane/LANES*w)+.5;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);if(lane===0||lane===LANES){ctx.strokeStyle='rgba(247,250,255,.95)';ctx.lineWidth=3}else if(lane===LANES/2){ctx.strokeStyle='rgba(226,235,252,.72)';ctx.lineWidth=2}else{ctx.strokeStyle='rgba(188,201,228,.52)';ctx.lineWidth=1.25}ctx.stroke()}
    const guide=project.guide;
    for(let m=0;m<project.measures;m++){
      const bottom=m*mh, yBottom=h-bottom;
      for(let i=1;i<guide;i++){const y=yBottom-i/guide*mh+.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.strokeStyle='rgba(146,159,188,.22)';ctx.lineWidth=1;ctx.stroke()}
      for(let b=1;b<project.numerator;b++){const y=yBottom-b/project.numerator*mh+.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.strokeStyle='rgba(224,232,248,.65)';ctx.lineWidth=1.8;ctx.stroke()}
      const y=Math.round(yBottom)+.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.strokeStyle='rgba(250,252,255,.97)';ctx.lineWidth=3;ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(0,.5);ctx.lineTo(w,.5);ctx.strokeStyle='rgba(250,252,255,.97)';ctx.lineWidth=3;ctx.stroke();
  }

  function renderNotes(){
    els.layer.innerHTML='';const h=totalHeight(),w=els.wrap.clientWidth;
    for(let m=1;m<=project.measures;m++){const label=document.createElement('div');label.className='measure-label';label.style.bottom=`${(m-1)*project.measureHeight-8}px`;label.textContent=`#${m}`;els.layer.appendChild(label)}
    project.notes.forEach(n=>{
      if(n.type==='long')renderLong(n,w,h);else renderBar(n,n,w,h,'start');
    });
    updateProperties();updateTransfer();updateTimeline();updatePlayhead();
  }
  function renderBar(n,p,w,h,part){
    const el=document.createElement('div');el.className=`note ${n.type}${selectedIds.has(n.id)?' selected':''}${selectedIds.size>1&&selectedIds.has(n.id)?' multi-selected':''}`;el.dataset.id=n.id;el.dataset.part=part;el.style.left=`${p.lane/LANES*100}%`;el.style.width=`${p.width/LANES*100}%`;el.style.bottom=`${tickToBottom(p.tick)-7.5}px`;const tag=document.createElement('span');tag.className='tag';tag.textContent=n.type==='long'?(part==='start'?'LONG START':'LONG END'):n.type.toUpperCase();el.appendChild(tag);els.layer.appendChild(el);return el
  }
  function renderLong(n,w,h){
    const a=n.start,b=n.end;const aX=(a.lane+a.width/2)/LANES*w,aY=h-tickToBottom(a.tick),bX=(b.lane+b.width/2)/LANES*w,bY=h-tickToBottom(b.tick);const dx=bX-aX,dy=bY-aY,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;const link=document.createElement('div');link.className='long-link';link.style.left=`${aX}px`;link.style.top=`${aY}px`;link.style.width=`${len}px`;link.style.transform=`rotate(${ang}deg)`;els.layer.appendChild(link);renderBar(n,a,w,h,'start');renderBar(n,b,w,h,'end')
  }
  function renderAll(){syncUIFromProject();resizeCanvas();renderNotes();updateEvents();updateTimerUI();}
