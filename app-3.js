  // 長大な譜面を単一canvasへ描くとブラウザの最大寸法を超えるため、
  // 1小節分の罫線画像を生成し、背景として繰り返す。
  function resizeCanvas(){
    const h=Math.round(totalHeight());
    els.wrap.style.height=`${h}px`;
    els.canvas.style.display='none';
    const pad=Math.max(32,Math.round(els.stage.clientHeight*0.32));
    const holder=els.wrap.parentElement;
    holder.style.paddingTop=`${pad}px`;
    holder.style.paddingBottom=`${pad}px`;
    drawGrid();
  }
  function drawGrid(){
    const w=Math.max(600,Math.round(els.wrap.clientWidth));
    const mh=Math.max(1,Math.round(project.measureHeight));
    const tile=document.createElement('canvas');
    tile.width=w;tile.height=mh;
    const g=tile.getContext('2d');
    g.fillStyle='#141c33';g.fillRect(0,0,w,mh);

    // 公式画面に合わせ、縦線は2列ごとに強線、その間を弱線にする。
    for(let lane=0;lane<=LANES;lane++){
      const x=Math.round(lane/LANES*w)+0.5;
      g.beginPath();g.moveTo(x,0);g.lineTo(x,mh);
      if(lane===0||lane===LANES){g.strokeStyle='rgba(247,250,255,.98)';g.lineWidth=3}
      else if(lane%2===0){g.strokeStyle='rgba(226,235,252,.78)';g.lineWidth=2}
      else{g.strokeStyle='rgba(154,169,199,.30)';g.lineWidth=1}
      g.stroke();
    }

    // 選択した4〜192分刻みを、そのまま小節内の細分線へ反映する。
    const guide=Math.max(1,Number(project.guide)||8);
    for(let i=1;i<guide;i++){
      const y=Math.round(mh-i/guide*mh)+0.5;
      g.beginPath();g.moveTo(0,y);g.lineTo(w,y);
      g.strokeStyle='rgba(146,159,188,.25)';g.lineWidth=1;g.stroke();
    }
    for(let beat=1;beat<project.numerator;beat++){
      const y=Math.round(mh-beat/project.numerator*mh)+0.5;
      g.beginPath();g.moveTo(0,y);g.lineTo(w,y);
      g.strokeStyle='rgba(224,232,248,.66)';g.lineWidth=1.8;g.stroke();
    }
    g.beginPath();g.moveTo(0,1.5);g.lineTo(w,1.5);g.moveTo(0,mh-1.5);g.lineTo(w,mh-1.5);
    g.strokeStyle='rgba(250,252,255,.98)';g.lineWidth=3;g.stroke();

    els.wrap.style.backgroundColor='#141c33';
    els.wrap.style.backgroundImage=`url(${tile.toDataURL('image/png')})`;
    els.wrap.style.backgroundRepeat='repeat-y';
    els.wrap.style.backgroundPosition='left bottom';
    els.wrap.style.backgroundSize=`100% ${mh}px`;
  }

  function getCurrentTime(){if(els.audio.src&&!els.audio.paused)return els.audio.currentTime;if(running)return externalBase+(performance.now()-externalStart)/1000;return currentTime}
  function playbackEndTime(){const chartEnd=Math.max(0,tickToTime(project.measures*TPM));const audioEnd=Number.isFinite(els.audio.duration)?els.audio.duration:0;return Math.max(chartEnd,audioEnd,.001)}
  function chartTopForTick(tick,targetRatio=.68){
    const chartY=els.wrap.offsetTop+totalHeight()-tickToBottom(tick);
    return clamp(chartY-els.stage.clientHeight*targetRatio,0,Math.max(0,els.stage.scrollHeight-els.stage.clientHeight));
  }
  function followPlayback(tick){
    // smoothスクロールは連続呼び出しで遅延するため、毎フレーム直接追従させる。
    els.stage.scrollTop=chartTopForTick(tick,.68);
    updateTimeline();
  }
  function setCurrentTime(sec){
    currentTime=clamp(Number(sec)||0,0,playbackEndTime());
    externalBase=currentTime;
    // 外部再生タイマー中にシークした場合は、シークした瞬間を新しい基準時刻にする。
    if(running&&!els.audio.src)externalStart=performance.now();
    if(els.audio.src)els.audio.currentTime=currentTime;
    updateTimerUI();
    const tick=rawTimeToTick(currentTime);
    updatePlayhead(tick);
    followPlayback(tick);
  }
  async function toggleTimer(){if(running){stopTimer();return}running=true;$('#timerButton').classList.add('live');$('#timerDot').classList.add('live');if(els.audio.src){try{await els.audio.play()}catch(e){running=false;toast('音源を再生できませんでした')}}else{externalStart=performance.now();externalBase=currentTime}const tick=rawTimeToTick(getCurrentTime());updatePlayhead(tick);followPlayback(tick);loop()}
  function stopTimer(){currentTime=getCurrentTime();running=false;els.audio.pause();cancelAnimationFrame(raf);$('#timerButton').classList.remove('live');$('#timerDot').classList.remove('live');updateTimerUI();updateTimeline()}
  function loop(){if(!running)return;currentTime=getCurrentTime();const rawTick=rawTimeToTick(currentTime);updateTimerUI();updatePlayhead(rawTick);followPlayback(rawTick);raf=requestAnimationFrame(loop)}
  function updateTimerUI(){const t=running?getCurrentTime():currentTime;$('#timerButton').textContent=running?'計測を停止':'計測を開始';$('#timerStatus').textContent=running?(els.audio.src?'ローカル音源を再生中':'外部再生に同期して計測中'):'停止中';$('#seekInput').value=t.toFixed(3);$('#timeText').textContent=formatTime(t);const parts=tickParts(timeToTick(t));$('#positionText').value=`#${parts.measure}  ${parts.step}/${project.guide}`;$('#musicalText').textContent=`#${parts.measure}・${parts.step}/${project.guide}`}
  function updatePlayhead(tick=rawTimeToTick(running?getCurrentTime():currentTime)){els.playhead.style.bottom=`${tickToBottom(tick)-1}px`}

  function scrollToTick(tick){els.stage.scrollTo({top:chartTopForTick(tick,.5),behavior:'smooth'})}
  function jumpMeasure(m){m=clamp(Math.round(Number(m)||1,1,project.measures);$('#jumpMeasureInput').value=m;scrollToTick((m-1)*TPM)}

  function updateEvents(){const list=$('#eventList');list.innerHTML='';const recent=project.notes.slice(-7).reverse();recent.forEach(n=>{const p=noteStart(n),parts=tickParts(p.tick),raw=n.rawTime??n.rawStart;const item=document.createElement('div');item.className='event';item.innerHTML=`<strong>${raw==null?'—':Number(raw).toFixed(3)}</strong><span>#${parts.measure}・${parts.step}/${project.guide} ${n.type==='long'?'ロング':n.type}</span><span>${p.lane}–${p.lane+p.width}</span>`;list.appendChild(item)});if(!recent.length)list.innerHTML='<div class="hint">まだ入力はありません。</div>';$('#noteCountLabel').textContent=`${project.notes.length}件`}
  function noteAtMeasure(n,m){const s=tickParts(noteStart(n).tick).measure,e=n.type==='long'?tickParts(n.end.tick).measure:s;return m>=s&&m<=e}
  function updateTransfer(){const m=clamp(Number($('#transferMeasureInput').value)||1,1,project.measures);$('#transferMeasureInput').value=m;$('#transferTitle').textContent=`#${m}`;const notes=project.notes.filter(n=>noteAtMeasure(n,m)).sort((a,b)=>noteStart(a).tick-noteStart(b).tick);const list=$('#transferList');list.innerHTML='';notes.forEach(n=>{const p=noteStart(n),sp=tickParts(p.tick),key=`${m}:${n.id}`,done=!!project.transferDone[key];const row=document.createElement('label');row.className='transfer-item';let txt=`${n.type}　${sp.step}/${project.guide}　列${p.lane}–${p.lane+p.width}`;if(n.type==='long'){const ep=tickParts(n.end.tick);txt+=` → #${ep.measure} ${ep.step}/${project.guide} 列${n.end.lane}–${n.end.lane+n.end.width}`}row.innerHTML=`<input type="checkbox" ${done?'checked':''}><span>${txt}</span>`;row.querySelector('input').addEventListener('change',e=>{project.transferDone[key]=e.target.checked;scheduleSave();updateTransferProgress()});list.appendChild(row)});if(!notes.length)list.innerHTML='<div class="hint">この小節にノーツはありません。</div>';updateTransferProgress()}
  function updateTransferProgress(){const all=project.notes.length,done=Object.values(project.transferDone).filter(Boolean).length;$('#transferProgress').value=all?`${Math.round(done/all*100)}%`:'0%'}
  function updateTimeline(){
    const bars=$('#timelineBars');bars.innerHTML='';
    for(let i=0;i<32;i++){
      const a=i/32*project.measures*TPM,b=(i+1)/32*project.measures*TPM,count=project.notes.filter(n=>{const t=noteStart(n).tick;return t>=a&&t<b}).length;
      const el=document.createElement('i');el.style.height=`${Math.max(8,Math.min(100,12+count*8))}%`;bars.appendChild(el)
    }
    const chartTop=els.wrap.offsetTop;
    const chartBottom=chartTop+totalHeight();
    const viewTop=els.stage.scrollTop;
    const viewBottom=viewTop+els.stage.clientHeight;
    const visibleTop=clamp(viewTop,chartTop,chartBottom);
    const visibleBottom=clamp(viewBottom,chartTop,chartBottom);
    const hasVisibleChart=visibleBottom>visibleTop;
    const start=hasVisibleChart?(chartBottom-visibleBottom)/totalHeight()*100:0;
    const width=hasVisibleChart?(visibleBottom-visibleTop)/totalHeight()*100:0;
    const left=clamp(start,0,100);
    $('#timelineWindow').style.left=`${left}%`;
    $('#timelineWindow').style.width=`${Math.max(2,clamp(width,0,100-left))}%`;
    const marker=$('#timelinePlayhead');
    if(marker){const t=running?getCurrentTime():currentTime;marker.style.left=`${clamp(t/playbackEndTime()*100,0,100)}%`;marker.dataset.time=formatTime(t)}
  }

  function setupSeekingControls(){
    const transport=$('.transport');
    const play=$('#playBtn');
    if(transport&&!$('#rewind5Btn')){
      const rewind=document.createElement('button');rewind.id='rewind5Btn';rewind.textContent='−5s';rewind.title='5秒戻る（←）';
      const forward=document.createElement('button');forward.id='forward5Btn';forward.textContent='+5s';forward.title='5秒進む（→）';
      transport.insertBefore(rewind,play);transport.insertBefore(forward,$('#toCurrentBtn'));
    }
    const timeline=$('.timeline');
    if(timeline&&!$('#timelinePlayhead')){const marker=document.createElement('div');marker.id='timelinePlayhead';marker.className='timeline-playhead';timeline.appendChild(marker)}
    const style=document.createElement('style');
    style.textContent='.bottom{grid-template-columns:230px minmax(0,1fr) 180px}.transport button{width:42px}.timeline{cursor:ew-resize;touch-action:none}.timeline-playhead{position:absolute;top:0;bottom:0;width:3px;transform:translateX(-1.5px);background:#8df06d;box-shadow:0 0 10px rgba(141,240,109,.8);z-index:5;pointer-events:none}.timeline-playhead:after{content:attr(data-time);position:absolute;left:50%;top:2px;transform:translateX(-50%);padding:2px 5px;border-radius:5px;background:rgba(7,12,22,.88);color:#eaffdf;font-size:9px;white-space:nowrap}.seek-help{margin-top:8px;color:var(--muted);font-size:10px;line-height:1.55}';
    document.head.appendChild(style);
    const timerCard=$('.timer-card');
    if(timerCard&&!timerCard.querySelector('.seek-help')){const help=document.createElement('div');help.className='seek-help';help.textContent='下のタイムラインをクリック／ドラッグ、または譜面を右クリックすると、その位置へ移動します。←／→キーで5秒移動できます。';timerCard.appendChild(help)}
  }
  function seekFromTimelineEvent(e){
    const timeline=$('.timeline'),rect=timeline.getBoundingClientRect();
    const ratio=clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1);
    setCurrentTime(ratio*playbackEndTime());
  }
  let timelineSeeking=false;

  function exportProject(){syncSettingsFromUI(false);const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${project.title.replace(/[\/:*?"<>|]/g,'_')||'score'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('JSONを保存しました')}
  function importProject(file){const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);if(!Array.isArray(data.notes))throw new Error();project={...project,...data};project.notes=project.notes.map(normalizeNote);selectedIds.clear();history=[];future=[];renderAll();saveLocal();toast('プロジェクトを読み込みました')}catch(e){toast('このJSONは読み込めません')}};r.readAsText(file)}

  setupSeekingControls();
  const timeline=$('.timeline');
  timeline.addEventListener('pointerdown',e=>{e.preventDefault();timelineSeeking=true;timeline.setPointerCapture?.(e.pointerId);seekFromTimelineEvent(e)});
  timeline.addEventListener('pointermove',e=>{if(timelineSeeking)seekFromTimelineEvent(e)});
  timeline.addEventListener('pointerup',e=>{timelineSeeking=false;timeline.releasePointerCapture?.(e.pointerId)});
  timeline.addEventListener('pointercancel',()=>{timelineSeeking=false});
  $('#rewind5Btn').addEventListener('click',()=>setCurrentTime(getCurrentTime()-5));
  $('#forward5Btn').addEventListener('click',()=>setCurrentTime(getCurrentTime()+5));
  els.wrap.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const rect=els.wrap.getBoundingClientRect();
    const bottom=clamp(rect.height-(e.clientY-rect.top),0,rect.height);
    const rawTick=clamp(bottom/project.measureHeight*TPM,0,project.measures*TPM);
    setCurrentTime(tickToTime(rawTick));
    toast(`再生位置を ${formatTime(currentTime)} に移動しました`);
  });
  window.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='ArrowLeft'){e.preventDefault();setCurrentTime(getCurrentTime()-5)}
    else if(e.key==='ArrowRight'){e.preventDefault();setCurrentTime(getCurrentTime()+5)}
  });

  $$('.tab').forEach(t=>t.addEventListener('click',()=>{mode=t.dataset.mode;$$('.tab').forEach(x=>x.classList.toggle('active',x===t));$$('.capture-only').forEach(x=>x.hidden=mode!=='capture');$$('.edit-only').forEach(x=>x.hidden=mode!=='edit');$$('.transfer-only').forEach(x=>x.hidden=mode!=='transfer');if(mode==='transfer')jumpMeasure($('#transferMeasureInput').value);toast(mode==='capture'?'タイミング入力':mode==='edit'?'譜面編集':'転記モード')}));
  $$('.palette button').forEach(b=>b.addEventListener('click',()=>{$$('.palette button').forEach(x=>x.classList.toggle('active',x===b));activeType=b.dataset.type;pendingLong=null;toast(`配置：${b.querySelector('strong').textContent}`)}));
  $$('.edit-tool').forEach(b=>b.addEventListener('click',()=>setEditTool(b.dataset.editTool)));
  setEditTool('draw');
  ['#titleInput','#bpmInput','#measureInput','#numeratorInput','#denominatorInput','#offsetInput'].forEach(s=>$(s).addEventListener('change',()=>syncSettingsFromUI(true)));
  $('#guideSelect').addEventListener('change',()=>{project.guide=Number($('#guideSelect').value);drawGrid();renderNotes();updateEvents();scheduleSave();const tick=rawTimeToTick(running?getCurrentTime():currentTime);updatePlayhead(tick);if(running)followPlayback(tick);toast(`${project.guide}分刻みを罫線へ反映しました`)});
  $('#zoomIn').addEventListener('click',()=>{project.measureHeight=clamp(project.measureHeight+40,200,520);renderAll();scheduleSave()});$('#zoomOut').addEventListener('click',()=>{project.measureHeight=clamp(project.measureHeight-40,200,520);renderAll();scheduleSave()});
  $('#jumpBtn').addEventListener('click',()=>jumpMeasure($('#jumpMeasureInput').value));$('#transferMeasureInput').addEventListener('change',()=>{jumpMeasure($('#transferMeasureInput').value);updateTransfer()});$('#prevMeasureBtn').addEventListener('click',()=>{$('#transferMeasureInput').value=clamp(Number($('#transferMeasureInput').value)-1,1,project.measures);updateTransfer();jumpMeasure($('#transferMeasureInput').value)});$('#nextMeasureBtn').addEventListener('click',()=>{$('#transferMeasureInput').value=clamp(Number($('#transferMeasureInput').value)+1,1,project.measures);updateTransfer();jumpMeasure($('#transferMeasureInput').value)});
  $('#timerButton').addEventListener('click',toggleTimer);$('#playBtn').addEventListener('click',toggleTimer);$('#seekInput').addEventListener('change',()=>setCurrentTime($('#seekInput').value));$('#toStartBtn').addEventListener('click',()=>setCurrentTime(project.offset));$('#toCurrentBtn').addEventListener('click',()=>scrollToTick(timeToTick(currentTime)));
  $('#audioFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(f);els.audio.src=audioUrl;$('#audioName').textContent=f.name;els.audio.onended=stopTimer;toast('音源はこのブラウザ内だけで読み込みました')});
  $('#referenceFiles').addEventListener('change',e=>{[...e.target.files].forEach(f=>{const url=URL.createObjectURL(f);referenceUrls.push(url);const box=document.createElement('div');box.className='reference';box.innerHTML=`<img src="${url}" alt="参考譜面"><button title="削除">×</button>`;box.querySelector('button').onclick=()=>{URL.revokeObjectURL(url);box.remove()};$('#referenceList').appendChild(box)});e.target.value=''});
  $('#manualSaveBtn').addEventListener('click',()=>{saveLocal();toast('この端末に保存しました')});$('#exportProjectBtn').addEventListener('click',exportProject);$('#importProjectBtn').addEventListener('click',()=>$('#projectFile').click());$('#projectFile').addEventListener('change',e=>{if(e.target.files[0])importProject(e.target.files[0]);e.target.value=''});
  $('#undoBtn').addEventListener('click',undo);$('#redoBtn').addEventListener('click',redo);els.stage.addEventListener('scroll',updateTimeline);window.addEventListener('resize',()=>{resizeCanvas();renderNotes()});
  $('#closeWelcome').addEventListener('click',()=>$('#welcomeModal').classList.remove('open'));

  const loaded=loadLocal();syncUIFromProject();renderAll();updateUndo();setTimeout(()=>{els.stage.scrollTop=Math.max(0,totalHeight()-els.stage.clientHeight);updateTimeline()},30);let showWelcome=true;try{showWelcome=!sessionStorage.getItem('scoremaker-welcome');if(showWelcome)sessionStorage.setItem('scoremaker-welcome','1')}catch(e){}if(showWelcome)$('#welcomeModal').classList.add('open');if(loaded)toast('前回の端末内データを復元しました');
