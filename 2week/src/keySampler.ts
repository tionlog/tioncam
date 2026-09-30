const PAD_KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'] as const
type PadKey = typeof PAD_KEYS[number]
const KEY_CODE_MAP: Record<string, PadKey> = {
  KeyQ: 'q', KeyW: 'w', KeyE: 'e',
  KeyA: 'a', KeyS: 's', KeyD: 'd',
  KeyZ: 'z', KeyX: 'x', KeyC: 'c',
}

interface PadSound {
  buffer: AudioBuffer | null
  pitch: number
  speed: number
  source: 'built-in' | 'file' | 'mic'
}

interface LoopEvent {
  key: PadKey
  time: number
  pitch: number
  speed: number
}

interface LoopTrack {
  id: number
  name: string
  events: LoopEvent[]
  duration: number
  isPlaying: boolean
  anchorTime: number
  nextCycleTime: number
  scheduler: number | null
  sources: Set<AudioBufferSourceNode>
}

interface MicClip {
  id: number
  name: string
  buffer: AudioBuffer
  duration: number
  assignedKeys: Set<PadKey>
  source: AudioBufferSourceNode | null
}

const PAD_COLORS = ['#ff5b7f', '#ff9d54', '#f4d35e', '#68d3a4', '#55c4e8', '#6f8cff', '#9b75ed', '#d86fce', '#f06b9b']

export const keySamplerMarkup = `
  <main class="key-sampler">
    <header class="sampler-header">
      <div>
        <p class="sampler-kicker">POLYPHONIC KEYBOARD INSTRUMENT</p>
        <h1>key <em>sampler</em></h1>
      </div>
      <div class="sampler-status" aria-live="polite">
        <span class="status-lamp"></span>
        <span id="samplerStatus">9개의 패드가 준비되었습니다</span>
      </div>
      <div class="sample-control">
        <button class="sample-mode-button" id="sampleModeButton">
          <span class="mic-icon"></span>
          <span><b>SAMPLING</b><small>마이크 녹음 시작</small></span>
        </button>
        <div class="mic-wave-bubble" id="micWaveBubble" hidden>
          <div class="mic-bubble-head"><span><i></i> LIVE INPUT</span><time id="micRecordTime">00:00.0</time></div>
          <div class="mic-wave-bars" aria-label="실시간 마이크 입력 레벨">
            ${Array.from({ length: 22 }, () => '<i></i>').join('')}
          </div>
          <small>버튼을 다시 누르면 녹음이 완료됩니다</small>
        </div>
      </div>
    </header>

    <div class="sampler-workspace">
      <section class="pad-section" aria-label="샘플 패드">
        <div class="pad-editor" id="padEditor" hidden>
          <div class="editor-key"><small>EDITING</small><strong id="editingKey">Q</strong></div>
          <div class="parameter">
            <span>PITCH</span>
            <button data-edit="pitch-down" aria-label="피치 내리기">−</button>
            <output id="pitchValue">0 st</output>
            <button data-edit="pitch-up" aria-label="피치 올리기">＋</button>
          </div>
          <div class="parameter">
            <span>SPEED</span>
            <button data-edit="speed-down" aria-label="속도 느리게">−</button>
            <output id="speedValue">1.0×</output>
            <button data-edit="speed-up" aria-label="속도 빠르게">＋</button>
          </div>
          <button class="editor-close" id="editorClose" aria-label="편집창 닫기">×</button>
        </div>

        <div class="pad-grid">
          ${PAD_KEYS.map((key, index) => `
            <button class="sample-pad" data-sampler-key="${key}" style="--pad-color:${PAD_COLORS[index]}" aria-label="${key.toUpperCase()} 샘플 재생">
              <span class="pad-corner">0${index + 1}</span>
              <strong>${key.toUpperCase()}</strong>
              <small data-pad-source>BUILT-IN</small>
              <i></i>
            </button>
          `).join('')}
        </div>
        <div class="sampler-help">
          <p><span>Q W E</span><span>A S D</span><span>Z X C</span></p>
          <p>동시에 여러 키를 누를 수 있어요</p>
          <p>패드를 길게 누르면 피치와 속도를 편집할 수 있어요</p>
        </div>
      </section>

      <aside class="loop-studio" aria-label="연주 녹음 목록">
        <div class="loop-heading">
          <div><p>LOOP STUDIO</p><h2>Recordings</h2></div>
          <button id="newRecordingButton"><span>＋</span> 새 녹음</button>
        </div>

        <button class="record-button" id="recordButton">
          <i></i>
          <span><b>RECORD</b><small>SPACE BAR</small></span>
          <time id="recordTime">00:00.0</time>
        </button>

        <div class="recording-summary">
          <span id="recordingCount">0 RECORDINGS</span>
          <span>선택 후 녹음하면 레이어가 추가돼요</span>
        </div>
        <div class="recording-list" id="recordingList">
          <div class="empty-recordings" id="emptyRecordings">
            <div class="empty-wave"><i></i><i></i><i></i><i></i><i></i></div>
            <b>아직 녹음이 없어요</b>
            <small>스페이스 바를 눌러 첫 루프를 만들어보세요.</small>
          </div>
        </div>
      </aside>
    </div>
  </main>
`

export function setupKeySampler(root: HTMLElement) {
  const pads = new Map<PadKey, HTMLButtonElement>()
  root.querySelectorAll<HTMLButtonElement>('[data-sampler-key]').forEach((button) => pads.set(button.dataset.samplerKey as PadKey, button))

  const status = root.querySelector<HTMLElement>('#samplerStatus')!
  const sampleModeButton = root.querySelector<HTMLButtonElement>('#sampleModeButton')!
  const micWaveBubble = root.querySelector<HTMLElement>('#micWaveBubble')!
  const micRecordTime = root.querySelector<HTMLTimeElement>('#micRecordTime')!
  const micWaveBars = [...root.querySelectorAll<HTMLElement>('.mic-wave-bars i')]
  const padEditor = root.querySelector<HTMLElement>('#padEditor')!
  const editingKey = root.querySelector<HTMLElement>('#editingKey')!
  const pitchValue = root.querySelector<HTMLOutputElement>('#pitchValue')!
  const speedValue = root.querySelector<HTMLOutputElement>('#speedValue')!
  const editorClose = root.querySelector<HTMLButtonElement>('#editorClose')!
  const recordButton = root.querySelector<HTMLButtonElement>('#recordButton')!
  const recordTime = root.querySelector<HTMLTimeElement>('#recordTime')!
  const newRecordingButton = root.querySelector<HTMLButtonElement>('#newRecordingButton')!
  const recordingList = root.querySelector<HTMLElement>('#recordingList')!
  const recordingCount = root.querySelector<HTMLElement>('#recordingCount')!

  const sounds = new Map<PadKey, PadSound>()
  const baseSounds = new Map<PadKey, Pick<PadSound, 'buffer' | 'source'>>()
  const heldInputs = new Map<PadKey, Set<string>>()
  const holdTimers = new Map<string, number>()
  const tracks: LoopTrack[] = []
  const micClips: MicClip[] = []
  let audioContext: AudioContext | null = null
  let master: GainNode | null = null
  let isActive = false
  let filesChecked = false
  let editing: PadKey = 'q'
  let selectedTrackId: number | null = null
  let nextTrackId = 1
  let nextMicClipId = 1

  let samplingArmed = false
  let mediaStream: MediaStream | null = null
  let microphoneRequest: Promise<MediaStream> | null = null
  let micSource: MediaStreamAudioSourceNode | null = null
  let micProcessor: ScriptProcessorNode | null = null
  let micSilentGain: GainNode | null = null
  let micPcmChunks: Float32Array[] = []
  let micPeak = 0
  let micEnergy = 0
  let micSampleCount = 0
  const micLevelHistory = Array.from({ length: 22 }, () => .04)
  let samplingStartedAt = 0
  let micClockTimer = 0

  let isRecording = false
  let recordingStart = 0
  let recordingEvents: LoopEvent[] = []
  let recordingTimer = 0

  function setStatus(message: string, alert = false) {
    status.textContent = message
    root.querySelector('.sampler-status')?.classList.toggle('alert', alert)
  }

  function getAudio() {
    if (!audioContext) {
      audioContext = new AudioContext({ latencyHint: 'interactive' })
      master = audioContext.createGain()
      master.gain.value = .72
      master.connect(audioContext.destination)
      PAD_KEYS.forEach((key, index) => {
        const buffer = makeBuiltInBuffer(audioContext!, index)
        sounds.set(key, { buffer, pitch: 0, speed: 1, source: 'built-in' })
        baseSounds.set(key, { buffer, source: 'built-in' })
      })
    }
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  }

  function makeBuiltInBuffer(ctx: AudioContext, index: number) {
    const duration = .34 + (index % 3) * .12
    const length = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    const base = [72, 155, 280, 98, 210, 370, 125, 250, 510][index]
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate
      const decay = Math.exp(-t * (7 + index % 4))
      const tone = Math.sin(Math.PI * 2 * base * t + Math.sin(t * 22) * .7)
      const overtone = Math.sin(Math.PI * 2 * base * (1.5 + index % 3 * .25) * t) * .28
      const noise = (Math.random() * 2 - 1) * (index === 1 || index === 2 ? .42 : .08)
      data[i] = (tone + overtone + noise) * decay * .58
    }
    return buffer
  }

  async function loadPublicSamples() {
    if (filesChecked) return
    filesChecked = true
    const ctx = getAudio()
    await Promise.all(PAD_KEYS.map(async (key) => {
      const candidates = [`${key}.wav`, `${key}.mp3`]
      for (const filename of candidates) {
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}samples/${filename}`)
          if (!response.ok) continue
          const decoded = await ctx.decodeAudioData(await response.arrayBuffer())
          const current = sounds.get(key)!
          sounds.set(key, { ...current, buffer: decoded, source: 'file' })
          baseSounds.set(key, { buffer: decoded, source: 'file' })
          updatePadSource(key)
          break
        } catch { /* Try the next supported extension. */ }
      }
    }))
    setStatus('패드 준비 완료 · WAV와 MP3 파일을 인식합니다')
  }

  function updatePadSource(key: PadKey) {
    const sound = sounds.get(key)
    const label = pads.get(key)?.querySelector<HTMLElement>('[data-pad-source]')
    if (!sound || !label) return
    label.textContent = sound.source === 'mic' ? 'MIC SAMPLE' : sound.source === 'file' ? 'FILE SAMPLE' : 'BUILT-IN'
    pads.get(key)?.classList.toggle('custom-sample', sound.source !== 'built-in')
  }

  function scheduleSound(key: PadKey, when?: number, pitch?: number, speed?: number) {
    const ctx = getAudio()
    const sound = sounds.get(key)
    if (!sound?.buffer || !master) return null
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = sound.buffer
    source.playbackRate.value = (speed ?? sound.speed) * Math.pow(2, (pitch ?? sound.pitch) / 12)
    gain.gain.setValueAtTime(.001, when ?? ctx.currentTime)
    gain.gain.linearRampToValueAtTime(.9, (when ?? ctx.currentTime) + .004)
    source.connect(gain).connect(master)
    source.start(when ?? ctx.currentTime)
    return source
  }

  function recordHit(key: PadKey) {
    if (!isRecording || !audioContext) return
    const sound = sounds.get(key)!
    const selected = tracks.find((track) => track.id === selectedTrackId)
    const absoluteTime = audioContext.currentTime
    const time = selected
      ? ((absoluteTime - selected.anchorTime) % selected.duration + selected.duration) % selected.duration
      : Math.max(0, absoluteTime - recordingStart)
    recordingEvents.push({ key, time, pitch: sound.pitch, speed: sound.speed })
  }

  function triggerKey(key: PadKey, inputId: string) {
    const inputs = heldInputs.get(key) ?? new Set<string>()
    if (inputs.has(inputId)) return
    inputs.add(inputId); heldInputs.set(key, inputs)
    pads.get(key)?.classList.add('pressed')
    scheduleSound(key)
    recordHit(key)
  }

  function releaseKey(key: PadKey, inputId: string) {
    const inputs = heldInputs.get(key)
    inputs?.delete(inputId)
    if (!inputs?.size) pads.get(key)?.classList.remove('pressed')
  }

  function clearHeldInputs() {
    heldInputs.forEach((_, key) => pads.get(key)?.classList.remove('pressed'))
    heldInputs.clear()
    holdTimers.forEach((timer) => window.clearTimeout(timer))
    holdTimers.clear()
  }

  function microphoneErrorMessage(error: unknown) {
    const name = error instanceof DOMException ? error.name : ''
    if (!window.isSecureContext) return '마이크는 HTTPS 또는 localhost 주소에서만 사용할 수 있어요'
    if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 권한이 차단되어 있어요. 주소창의 마이크 설정에서 허용해주세요'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '사용 가능한 마이크를 찾지 못했어요'
    if (name === 'NotReadableError' || name === 'TrackStartError') return '마이크를 다른 앱이 사용 중이거나 macOS 권한이 꺼져 있어요'
    if (name === 'OverconstrainedError') return '현재 마이크에서 요청한 녹음 설정을 지원하지 않아요'
    return '마이크를 시작하지 못했어요. 브라우저와 시스템 권한을 확인해주세요'
  }

  async function prepareMicrophone() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Microphone API unavailable', 'SecurityError')
    }
    if (mediaStream?.getAudioTracks().some((track) => track.readyState === 'live')) return mediaStream
    if (microphoneRequest) return microphoneRequest

    microphoneRequest = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    try {
      mediaStream = await microphoneRequest
      return mediaStream
    } finally {
      microphoneRequest = null
    }
  }

  function stopMicrophoneStream() {
    mediaStream?.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }

  function disconnectMicCapture() {
    if (micProcessor) micProcessor.onaudioprocess = null
    try { micSource?.disconnect() } catch { /* Already disconnected. */ }
    try { micProcessor?.disconnect() } catch { /* Already disconnected. */ }
    try { micSilentGain?.disconnect() } catch { /* Already disconnected. */ }
    micSource = null
    micProcessor = null
    micSilentGain = null
    sampleModeButton.style.setProperty('--mic-level', '0%')
  }

  async function reportMicrophonePermission() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('현재 주소에서는 마이크를 사용할 수 없어요 · localhost 또는 HTTPS 필요', true)
      sampleModeButton.classList.add('blocked')
      return
    }
    try {
      const permission = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
      sampleModeButton.classList.toggle('blocked', permission?.state === 'denied')
      if (permission?.state === 'denied') setStatus('브라우저에서 마이크가 차단됨 · 주소창 설정에서 허용해주세요', true)
    } catch { /* Safari does not expose microphone through Permissions API. */ }
  }

  function resetMicUi() {
    window.clearInterval(micClockTimer)
    micRecordTime.textContent = '00:00.0'
    micWaveBubble.hidden = true
    micLevelHistory.fill(.04)
    micWaveBars.forEach((bar) => { bar.style.height = '4px' })
    sampleModeButton.querySelector('b')!.textContent = 'SAMPLING'
    sampleModeButton.querySelector('small')!.textContent = '마이크 녹음 시작'
  }

  function updateMicClock() {
    const elapsed = Math.max(0, performance.now() - samplingStartedAt) / 1000
    const minutes = Math.floor(elapsed / 60)
    const seconds = Math.floor(elapsed % 60)
    const tenth = Math.floor((elapsed % 1) * 10)
    micRecordTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenth}`
  }

  async function startMicSampling() {
    setStatus('실제 마이크 입력 권한을 요청하는 중…', true)
    try {
      mediaStream = await prepareMicrophone()
      if (!samplingArmed) { stopMicrophoneStream(); return }
      const ctx = getAudio()
      await ctx.resume()
      micPcmChunks = []
      micPeak = 0
      micEnergy = 0
      micSampleCount = 0
      micSource = ctx.createMediaStreamSource(mediaStream)
      micProcessor = ctx.createScriptProcessor(2048, 1, 1)
      micSilentGain = ctx.createGain()
      micSilentGain.gain.value = 0
      micProcessor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        const copy = new Float32Array(input)
        let blockEnergy = 0
        for (let index = 0; index < copy.length; index++) {
          const value = copy[index]
          const absolute = Math.abs(value)
          if (absolute > micPeak) micPeak = absolute
          blockEnergy += value * value
        }
        micEnergy += blockEnergy
        micSampleCount += copy.length
        micPcmChunks.push(copy)
        const blockRms = Math.sqrt(blockEnergy / copy.length)
        sampleModeButton.style.setProperty('--mic-level', `${Math.min(100, Math.max(2, blockRms * 1100))}%`)
        const intensity = Math.min(1, blockRms * 18)
        micLevelHistory.shift()
        micLevelHistory.push(Math.max(.04, intensity))
        micWaveBars.forEach((bar, index) => {
          const movement = .42 + Math.abs(Math.sin(index * .83)) * .58
          bar.style.height = `${4 + micLevelHistory[index] * movement * 34}px`
        })
      }
      micSource.connect(micProcessor)
      micProcessor.connect(micSilentGain)
      micSilentGain.connect(ctx.destination)
      samplingStartedAt = performance.now()
      micWaveBubble.hidden = false
      sampleModeButton.querySelector('b')!.textContent = 'STOP MIC'
      sampleModeButton.querySelector('small')!.textContent = '클릭해서 녹음 완료'
      sampleModeButton.classList.add('recording')
      micClockTimer = window.setInterval(updateMicClock, 50)
      const deviceName = mediaStream.getAudioTracks()[0]?.label || '내장 마이크'
      setStatus(`마이크 녹음 중 · ${deviceName} · 실시간 입력을 확인하세요`, true)
    } catch (error) {
      samplingArmed = false
      sampleModeButton.classList.remove('active', 'recording')
      sampleModeButton.classList.add('blocked')
      resetMicUi()
      setStatus(microphoneErrorMessage(error), true)
    }
  }

  function finishMicSampling(save: boolean) {
    const ctx = audioContext
    disconnectMicCapture()

    if (save && ctx && micPcmChunks.length) {
      const totalLength = micPcmChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const rms = Math.sqrt(micEnergy / Math.max(1, micSampleCount))
      if (micPeak < .0025 && rms < .0004) {
        setStatus('실제 마이크 입력이 감지되지 않았어요 · 입력 장치와 음량을 확인해주세요', true)
      } else {
        const buffer = ctx.createBuffer(1, totalLength, ctx.sampleRate)
        const output = buffer.getChannelData(0)
        let offset = 0
        const boost = Math.min(8, .85 / Math.max(micPeak, .001))
        micPcmChunks.forEach((chunk) => {
          for (let index = 0; index < chunk.length; index++) output[offset + index] = chunk[index] * boost
          offset += chunk.length
        })
        const id = nextMicClipId++
        const clip: MicClip = {
          id,
          name: `Mic Sample ${String(id).padStart(2, '0')}`,
          buffer,
          duration: buffer.duration,
          assignedKeys: new Set(),
          source: null,
        }
        micClips.unshift(clip)
        renderTracks()
        setStatus(`${clip.name} 저장 완료 · 우측 목록에서 적용할 키를 선택하세요`)
      }
    }

    micPcmChunks = []
    stopMicrophoneStream()
    samplingArmed = false
    sampleModeButton.classList.remove('active', 'recording')
    resetMicUi()
  }

  function stopMicSampling() {
    if (!micProcessor) {
      setStatus('마이크가 아직 준비 중이에요', true)
      return
    }
    const remaining = Math.max(0, 350 - (performance.now() - samplingStartedAt))
    setStatus('마이크 녹음을 처리하는 중…')
    window.setTimeout(() => {
      if (micProcessor) finishMicSampling(true)
    }, remaining)
  }

  function openEditor(key: PadKey) {
    editing = key
    padEditor.hidden = false
    pads.forEach((pad, padKey) => pad.classList.toggle('editing', padKey === key))
    refreshEditor()
    setStatus(`${key.toUpperCase()} 패드 사운드를 편집하는 중`)
  }

  function refreshEditor() {
    const sound = sounds.get(editing)
    if (!sound) return
    editingKey.textContent = editing.toUpperCase()
    pitchValue.value = `${sound.pitch > 0 ? '+' : ''}${sound.pitch} st`
    speedValue.value = `${sound.speed.toFixed(1)}×`
  }

  function closeEditor() {
    padEditor.hidden = true
    pads.forEach((pad) => pad.classList.remove('editing'))
    setStatus('패드를 누르거나 스페이스 바로 연주를 녹음하세요')
  }

  function getSelectedTrack() { return tracks.find((track) => track.id === selectedTrackId) ?? null }

  function startLoop(track: LoopTrack) {
    if (track.isPlaying || !track.events.length) return
    const ctx = getAudio()
    track.isPlaying = true
    track.anchorTime = ctx.currentTime + .035
    track.nextCycleTime = track.anchorTime
    const schedule = () => {
      if (!track.isPlaying || !audioContext) return
      while (track.nextCycleTime < audioContext.currentTime + .16) {
        track.events.forEach((event) => {
          const source = scheduleSound(event.key, track.nextCycleTime + event.time, event.pitch, event.speed)
          if (source) {
            track.sources.add(source)
            source.onended = () => track.sources.delete(source)
          }
        })
        track.nextCycleTime += track.duration
      }
    }
    schedule()
    track.scheduler = window.setInterval(schedule, 30)
    renderTracks()
  }

  function stopLoop(track: LoopTrack) {
    track.isPlaying = false
    if (track.scheduler !== null) window.clearInterval(track.scheduler)
    track.scheduler = null
    track.sources.forEach((source) => { try { source.stop() } catch { /* Already stopped. */ } })
    track.sources.clear()
    renderTracks()
  }

  function selectTrack(id: number | null) {
    if (isRecording) return
    selectedTrackId = id
    renderTracks()
    setStatus(id ? `Recording ${String(id).padStart(2, '0')} 선택됨 · 녹음하면 레이어가 추가됩니다` : '새 녹음을 만들 준비가 되었습니다')
  }

  function startPerformanceRecording() {
    if (isRecording || samplingArmed) return
    const ctx = getAudio()
    const selected = getSelectedTrack()
    if (selected && !selected.isPlaying) startLoop(selected)
    recordingStart = ctx.currentTime
    recordingEvents = []
    isRecording = true
    recordButton.classList.add('recording')
    recordButton.querySelector('b')!.textContent = selected ? 'OVERDUBBING' : 'RECORDING'
    recordTime.textContent = '00:00.0'
    recordingTimer = window.setInterval(updateRecordTime, 50)
    setStatus(selected ? '기존 루프를 들으며 새 레이어를 녹음 중…' : '연주 녹음 중 · 스페이스 바로 완료', true)
  }

  function updateRecordTime() {
    if (!isRecording || !audioContext) return
    const elapsed = audioContext.currentTime - recordingStart
    const minutes = Math.floor(elapsed / 60)
    const seconds = Math.floor(elapsed % 60)
    const tenth = Math.floor((elapsed % 1) * 10)
    recordTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenth}`
  }

  function stopPerformanceRecording(save = true) {
    if (!isRecording || !audioContext) return
    isRecording = false
    window.clearInterval(recordingTimer)
    recordButton.classList.remove('recording')
    recordButton.querySelector('b')!.textContent = 'RECORD'
    const selected = getSelectedTrack()
    const elapsed = Math.max(.5, audioContext.currentTime - recordingStart)

    if (save && recordingEvents.length) {
      if (selected) {
        selected.events.push(...recordingEvents)
        selected.events.sort((a, b) => a.time - b.time)
        setStatus(`${selected.name}에 ${recordingEvents.length}개의 사운드 레이어를 추가했습니다`)
      } else {
        const id = nextTrackId++
        const track: LoopTrack = {
          id, name: `Recording ${String(id).padStart(2, '0')}`, events: recordingEvents,
          duration: elapsed, isPlaying: false, anchorTime: 0, nextCycleTime: 0, scheduler: null, sources: new Set(),
        }
        tracks.push(track); selectedTrackId = id
        setStatus(`${track.name} 녹음이 완료되었습니다`)
      }
    } else if (save) setStatus('재생된 패드가 없어 녹음을 저장하지 않았습니다', true)

    recordingEvents = []
    recordTime.textContent = '00:00.0'
    renderTracks()
  }

  function toggleRecording() {
    if (isRecording) stopPerformanceRecording()
    else startPerformanceRecording()
  }

  function toggleMicClip(clip: MicClip) {
    if (clip.source) {
      try { clip.source.stop() } catch { /* Already stopped. */ }
      clip.source = null
      renderTracks()
      return
    }
    const ctx = getAudio()
    if (!master) return
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.connect(master)
    clip.source = source
    source.onended = () => {
      if (clip.source === source) clip.source = null
      renderTracks()
    }
    source.start()
    renderTracks()
  }

  function assignMicClip(clip: MicClip, key: PadKey) {
    const previous = sounds.get(key)!
    sounds.set(key, { ...previous, buffer: clip.buffer, source: 'mic' })
    clip.assignedKeys.add(key)
    updatePadSource(key)
    renderTracks()
    setStatus(`${clip.name}을 ${key.toUpperCase()} 패드에 적용했습니다`)
    scheduleSound(key)
  }

  function deleteMicClip(clip: MicClip) {
    if (clip.source) {
      try { clip.source.stop() } catch { /* Already stopped. */ }
      clip.source = null
    }
    clip.assignedKeys.forEach((key) => {
      const current = sounds.get(key)
      const base = baseSounds.get(key)
      if (current?.buffer === clip.buffer && base) {
        sounds.set(key, { ...current, buffer: base.buffer, source: base.source })
        updatePadSource(key)
      }
    })
    const index = micClips.indexOf(clip)
    if (index >= 0) micClips.splice(index, 1)
    renderTracks()
    setStatus(`${clip.name}을 삭제하고 연결된 패드를 기본 사운드로 복구했습니다`)
  }

  function deleteLoopTrack(track: LoopTrack) {
    if (track.isPlaying) stopLoop(track)
    const index = tracks.indexOf(track)
    if (index >= 0) tracks.splice(index, 1)
    if (selectedTrackId === track.id) selectedTrackId = null
    renderTracks()
    setStatus(`${track.name}을 삭제했습니다`)
  }

  function renderTracks() {
    const total = tracks.length + micClips.length
    recordingCount.textContent = `${total} RECORDING${total === 1 ? '' : 'S'}`
    if (!total) {
      recordingList.innerHTML = `<div class="empty-recordings"><div class="empty-wave"><i></i><i></i><i></i><i></i><i></i></div><b>아직 녹음이 없어요</b><small>스페이스 바를 눌러 첫 루프를 만들어보세요.</small></div>`
      return
    }
    const micMarkup = micClips.map((clip) => `
      <article class="recording-item mic-clip-item">
        <button class="recording-delete" data-delete-mic="${clip.id}" aria-label="${clip.name} 삭제">×</button>
        <button class="loop-play ${clip.source ? 'playing' : ''}" data-mic-play="${clip.id}" aria-label="${clip.name} ${clip.source ? '정지' : '재생'}"><i></i></button>
        <div class="track-info"><b>${clip.name}</b><span>MIC · ${clip.duration.toFixed(1)} SEC</span></div>
        <span class="mic-clip-badge">MIC</span>
        <div class="assign-keys"><span>ASSIGN</span>${PAD_KEYS.map((key) => `<button class="${clip.assignedKeys.has(key) ? 'assigned' : ''}" data-assign-mic="${clip.id}" data-assign-key="${key}" aria-label="${clip.name}을 ${key.toUpperCase()} 키에 적용">${key.toUpperCase()}</button>`).join('')}</div>
      </article>
    `).join('')
    const loopMarkup = tracks.map((track) => `
      <article class="recording-item ${selectedTrackId === track.id ? 'selected' : ''}" data-track-id="${track.id}">
        <button class="recording-delete" data-delete-loop="${track.id}" aria-label="${track.name} 삭제">×</button>
        <button class="loop-play ${track.isPlaying ? 'playing' : ''}" data-loop-play="${track.id}" aria-label="${track.name} ${track.isPlaying ? '정지' : '반복 재생'}"><i></i></button>
        <div class="track-info"><b>${track.name}</b><span>${track.events.length} HITS · ${track.duration.toFixed(1)} SEC</span></div>
        <div class="mini-wave">${Array.from({ length: 12 }, (_, i) => `<i style="height:${7 + ((i * 7 + track.events.length * 3) % 18)}px"></i>`).join('')}</div>
      </article>
    `).join('')
    recordingList.innerHTML = micMarkup + loopMarkup
    recordingList.querySelectorAll<HTMLElement>('[data-track-id]').forEach((item) => item.addEventListener('click', () => selectTrack(Number(item.dataset.trackId))))
    recordingList.querySelectorAll<HTMLButtonElement>('[data-loop-play]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation()
      const track = tracks.find((candidate) => candidate.id === Number(button.dataset.loopPlay))
      if (track) track.isPlaying ? stopLoop(track) : startLoop(track)
    }))
    recordingList.querySelectorAll<HTMLButtonElement>('[data-mic-play]').forEach((button) => button.addEventListener('click', () => {
      const clip = micClips.find((candidate) => candidate.id === Number(button.dataset.micPlay))
      if (clip) toggleMicClip(clip)
    }))
    recordingList.querySelectorAll<HTMLButtonElement>('[data-assign-mic]').forEach((button) => button.addEventListener('click', () => {
      const clip = micClips.find((candidate) => candidate.id === Number(button.dataset.assignMic))
      const key = button.dataset.assignKey as PadKey
      if (clip && PAD_KEYS.includes(key)) assignMicClip(clip, key)
    }))
    recordingList.querySelectorAll<HTMLButtonElement>('[data-delete-mic]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation()
      const clip = micClips.find((candidate) => candidate.id === Number(button.dataset.deleteMic))
      if (clip) deleteMicClip(clip)
    }))
    recordingList.querySelectorAll<HTMLButtonElement>('[data-delete-loop]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation()
      const track = tracks.find((candidate) => candidate.id === Number(button.dataset.deleteLoop))
      if (track) deleteLoopTrack(track)
    }))
  }

  pads.forEach((button, key) => {
    button.addEventListener('pointerdown', (event) => {
      if (!isActive) return
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      const inputId = `pointer-${event.pointerId}`
      triggerKey(key, inputId)
      if (!samplingArmed) holdTimers.set(inputId, window.setTimeout(() => openEditor(key), 560))
    })
    const release = (event: PointerEvent) => {
      const inputId = `pointer-${event.pointerId}`
      const timer = holdTimers.get(inputId)
      if (timer) window.clearTimeout(timer)
      holdTimers.delete(inputId)
      releaseKey(key, inputId)
    }
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isActive) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat) toggleRecording()
      return
    }
    const key = KEY_CODE_MAP[event.code]
    if (!key || event.repeat) return
    event.preventDefault()
    triggerKey(key, 'keyboard')
  }
  const onKeyUp = (event: KeyboardEvent) => {
    const key = KEY_CODE_MAP[event.code]
    if (key) releaseKey(key, 'keyboard')
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearHeldInputs)

  sampleModeButton.addEventListener('click', async () => {
    if (micProcessor) {
      stopMicSampling()
      return
    }
    if (microphoneRequest) {
      setStatus('마이크 권한 응답을 기다리는 중이에요', true)
      return
    }
    samplingArmed = true
    sampleModeButton.classList.add('active')
    sampleModeButton.classList.remove('blocked')
    await startMicSampling()
  })
  recordButton.addEventListener('click', toggleRecording)
  newRecordingButton.addEventListener('click', () => selectTrack(null))
  editorClose.addEventListener('click', closeEditor)
  root.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((button) => button.addEventListener('click', () => {
    const sound = sounds.get(editing)
    if (!sound) return
    if (button.dataset.edit === 'pitch-down') sound.pitch = Math.max(-12, sound.pitch - 1)
    if (button.dataset.edit === 'pitch-up') sound.pitch = Math.min(12, sound.pitch + 1)
    if (button.dataset.edit === 'speed-down') sound.speed = Math.max(.5, Number((sound.speed - .1).toFixed(1)))
    if (button.dataset.edit === 'speed-up') sound.speed = Math.min(2, Number((sound.speed + .1).toFixed(1)))
    refreshEditor()
    scheduleSound(editing)
  }))

  // Buffers are generated immediately; files in public/samples override them on activation.
  getAudio()
  PAD_KEYS.forEach(updatePadSource)

  return {
    activate() {
      isActive = true
      void loadPublicSamples()
      void reportMicrophonePermission()
      setStatus('QWE · ASD · ZXC 키 또는 패드를 눌러 연주하세요')
    },
    deactivate() {
      isActive = false
      clearHeldInputs()
      tracks.forEach((track) => { if (track.isPlaying) stopLoop(track) })
      micClips.forEach((clip) => { if (clip.source) toggleMicClip(clip) })
      if (isRecording) stopPerformanceRecording()
      if (micProcessor) finishMicSampling(false)
      else stopMicrophoneStream()
      samplingArmed = false
      sampleModeButton.classList.remove('active', 'recording')
    },
  }
}
