document.write('<script src="app-1.js"><\/script><script src="app-2.js"><\/script><script src="app-3.js"><\/script>');

// 再生位置がノーツを通過した瞬間に、確認用の短い音を鳴らす。
// 音源素材は同梱せず、ブラウザの Web Audio でローカル生成する。
window.addEventListener('load',()=>{
  let noteAudioContext=null;
  let lastAudibleTick=null;

  async function ensureNoteAudioContext(){
    if(!noteAudioContext){
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)return null;
      noteAudioContext=new AudioContextClass();
    }
    if(noteAudioContext.state==='suspended'){
      try{await noteAudioContext.resume()}catch(error){}
    }
    return noteAudioContext;
  }

  function noteSoundEnabled(){const control=document.querySelector('#noteSoundToggle');return control?control.checked:true}
  function noteSoundVolume(){const control=document.querySelector('#noteSoundVolume');return control?Math.max(0,Math.min(1,(Number(control.value)||0)/100)):.55}

  function playScoreClick(type,phase='start',simultaneous=1){
    if(!noteSoundEnabled()||!noteAudioContext||noteAudioContext.state!=='running')return;
    const now=noteAudioContext.currentTime;
    const oscillator=noteAudioContext.createOscillator();
    const gain=noteAudioContext.createGain();
    const presets={
      tap:{wave:'triangle',from:920,to:720,duration:.055},
      critical:{wave:'square',from:1340,to:980,duration:.07},
      flick:{wave:'sawtooth',from:760,to:1720,duration:.085},
      'long-start':{wave:'sine',from:620,to:510,duration:.09},
      'long-end':{wave:'sine',from:440,to:330,duration:.075}
    };
    const preset=presets[type==='long'?`long-${phase}`:type]||presets.tap;
    oscillator.type=preset.wave;
    oscillator.frequency.setValueAtTime(preset.from,now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40,preset.to),now+preset.duration);
    const peak=.13*noteSoundVolume()/Math.sqrt(Math.max(1,simultaneous));
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(peak,now+.004);
    gain.gain.exponentialRampToValueAtTime(.0001,now+preset.duration);
    oscillator.connect(gain);
    gain.connect(noteAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now+preset.duration+.01);
  }

  function playCrossedNotes(fromTick,toTick){
    if(toTick<fromTick)return;
    // タブ復帰などで大きく時間が飛んだ場合、過去の音をまとめて鳴らさない。
    if(toTick-fromTick>TPM){return;}
    const events=[];
    for(const note of project.notes){
      if(note.type==='long'){
        if(note.start.tick>fromTick&&note.start.tick<=toTick)events.push({tick:note.start.tick,type:'long',phase:'start'});
        if(note.end.tick>fromTick&&note.end.tick<=toTick)events.push({tick:note.end.tick,type:'long',phase:'end'});
      }else if(note.tick>fromTick&&note.tick<=toTick){
        events.push({tick:note.tick,type:note.type,phase:'start'});
      }
    }
    events.sort((a,b)=>a.tick-b.tick);
    for(let index=0;index<events.length;){
      let end=index+1;
      while(end<events.length&&Math.abs(events[end].tick-events[index].tick)<.001)end++;
      const simultaneous=end-index;
      for(let cursor=index;cursor<end;cursor++){
        playScoreClick(events[cursor].type,events[cursor].phase,simultaneous);
      }
      index=end;
    }
  }

  const originalSetCurrentTime=setCurrentTime;
  setCurrentTime=function setCurrentTimeWithSoundReset(seconds){
    originalSetCurrentTime(seconds);
    lastAudibleTick=rawTimeToTick(currentTime);
  };

  const originalStopTimer=stopTimer;
  stopTimer=function stopTimerWithSoundReset(){
    originalStopTimer();
    lastAudibleTick=null;
  };

  // カーソル・画面追従と同じ毎フレーム処理で、通過したノーツを検出する。
  loop=function loopWithNoteSounds(){
    if(!running)return;
    currentTime=getCurrentTime();
    const rawTick=rawTimeToTick(currentTime);
    if(lastAudibleTick==null||rawTick<lastAudibleTick){lastAudibleTick=rawTick-1;}
    playCrossedNotes(lastAudibleTick,rawTick);
    lastAudibleTick=rawTick;
    updateTimerUI();
    updatePlayhead(rawTick);
    followPlayback(rawTick);
    raf=requestAnimationFrame(loop);
  };

  async function activateScoreSound(){
    if(!running)return;
    await ensureNoteAudioContext();
    lastAudibleTick=rawTimeToTick(getCurrentTime())-1;
  }
  $('#timerButton').addEventListener('click',activateScoreSound);
  $('#playBtn').addEventListener('click',activateScoreSound);
});
