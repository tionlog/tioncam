import type { HolisticLandmarker, HolisticLandmarkerResult, ImageSegmenter, MPMask } from '@mediapipe/tasks-vision'
import { isConanPose, isPrayerPose, PoseHold } from './gesture'
import type { Point3 } from './gesture'
import { composeCameraScene } from './background'
import { writePersonMask } from './person-mask'
import { updateCloneSource } from './clone'
import { drawCostume, getCostumeFrame, getPoseCostumeFrame, isHandBelowLips, revealTrackedHands } from './face-effect'
import type { CostumeFrame } from './face-effect'

type EffectState = 'loading' | 'ready' | 'active' | 'cloning' | 'costume' | 'error'
type TrackingState = 'face-missing' | 'hand-missing' | 'hand-away' | 'hand-near'

export class ConanEffect {
  private tracker: HolisticLandmarker | null = null
  private segmenter: ImageSegmenter | null = null
  private loading: Promise<void> | null = null
  private running = false
  private disposed = false
  private frame = 0
  private previousFrame = 0
  private lastDetection = -Infinity
  private lastVideoTime = -1
  private lastMask = -Infinity
  private interval = 1000 / 15
  private failures = 0
  private invalidMasks = 0
  private segmentFailures = 0
  // CPU tracking avoids WebGL failures on some camera/browser combinations.
  private preferCPU = true
  private opacity = 0
  private beam = 0
  private cloneAmount = 0
  private costumeAmount = 0
  private lastFace = -Infinity
  private faceFrame: CostumeFrame | null = null
  private costumeHands: Point3[][] = []
  private activeSince = 0
  private state: EffectState | null = null
  private trackingState: TrackingState | null = null
  private hold = new PoseHold()
  private prayerHold = new PoseHold(280, 500)
  private faceHold = new PoseHold(0, 600)
  private input = document.createElement('canvas')
  private inputContext = this.input.getContext('2d')!
  private segmentInput = document.createElement('canvas')
  private segmentInputContext = this.segmentInput.getContext('2d')!
  private snapshot = document.createElement('canvas')
  private snapshotContext = this.snapshot.getContext('2d')!
  private foreground = document.createElement('canvas')
  private foregroundContext = this.foreground.getContext('2d')!
  private cloneSource = document.createElement('canvas')
  private cloneSourceContext = this.cloneSource.getContext('2d', { willReadFrequently: true })!
  private cloneLayer = document.createElement('canvas')
  private cloneContext = this.cloneLayer.getContext('2d')!
  private mask = document.createElement('canvas')
  private maskContext = this.mask.getContext('2d')!
  private maskPixels: ImageData | null = null
  private context: CanvasRenderingContext2D
  private costumeCanvas = document.querySelector<HTMLCanvasElement>('#conanCostume')!
  private costumeContext = this.costumeCanvas.getContext('2d')!
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private report: (state: EffectState) => void
  private reportTracking: (state: TrackingState) => void

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, report: (state: EffectState) => void,
    reportTracking: (state: TrackingState) => void = () => {}) {
    this.video = video
    this.canvas = canvas
    this.context = canvas.getContext('2d')!
    this.report = report
    this.reportTracking = reportTracking
  }

  private setState(state: EffectState) {
    if (state === this.state) return
    this.state = state
    this.report(state)
  }

  private setTrackingState(state: TrackingState) {
    if (state === this.trackingState) return
    this.trackingState = state
    this.reportTracking(state)
  }

  private async load() {
    const { FilesetResolver, HolisticLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks('/mediapipe')
    const options = {
      runningMode: 'VIDEO' as const,
      outputPoseSegmentationMasks: true,
      outputFaceBlendshapes: false,
      minFaceDetectionConfidence: .3,
      minFacePresenceConfidence: .3,
      minHandLandmarksConfidence: .25,
      minPoseDetectionConfidence: .35,
      minPosePresenceConfidence: .35,
    }
    let tracker: HolisticLandmarker
    try {
      tracker = await HolisticLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task', delegate: this.preferCPU ? 'CPU' : 'GPU' },
      })
    } catch (error) {
      if (this.preferCPU) throw error
      this.preferCPU = true
      tracker = await HolisticLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: '/mediapipe/holistic_landmarker.task', delegate: 'CPU' },
      })
    }
    if (this.disposed) {
      tracker.close()
      return
    }
    this.tracker = tracker
    // The small person-specific model keeps hair, hands and clothing in the matte.
    // Pose segmentation remains available if this optional model cannot start.
    try {
      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/mediapipe/selfie_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      })
      if (this.disposed) segmenter.close()
      else this.segmenter = segmenter
    } catch (error) {
      console.warn('Dedicated person segmentation unavailable; using pose mask', error)
    }
  }

  async start() {
    if (this.disposed || this.running) return
    this.running = true
    this.setState('loading')
    try {
      if (!this.tracker) {
        if (!this.loading) this.loading = this.load().finally(() => { this.loading = null })
        await this.loading
      }
      if (!this.running || this.disposed) return
      this.setState('ready')
      // Multiple camera resumes may be waiting on the same model download.
      cancelAnimationFrame(this.frame)
      this.frame = requestAnimationFrame(this.render)
    } catch (error) {
      console.warn('Conan tracking could not start', error)
      if (!this.running || this.disposed) return
      this.stop()
      this.setState('error')
    }
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
    this.hold.reset()
    this.prayerHold.reset()
    this.faceHold.reset()
    this.faceFrame = null
    this.costumeHands = []
    this.lastFace = -Infinity
    this.trackingState = null
    this.opacity = this.beam = this.cloneAmount = this.costumeAmount = 0
    this.lastVideoTime = -1
    this.lastMask = this.lastDetection = -Infinity
    this.previousFrame = 0
    this.failures = 0
    this.invalidMasks = 0
    this.segmentFailures = 0
    this.canvas.style.opacity = '0'
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.costumeCanvas.style.opacity = '0'
    this.costumeContext.clearRect(0, 0, this.costumeCanvas.width, this.costumeCanvas.height)
  }

  dispose() {
    this.stop()
    this.disposed = true
    this.tracker?.close()
    this.tracker = null
    this.segmenter?.close()
    this.segmenter = null
  }

  private updateMask(mask: MPMask, dedicated = false) {
    if (!this.maskPixels || this.mask.width !== mask.width || this.mask.height !== mask.height) {
      this.mask.width = mask.width
      this.mask.height = mask.height
      this.maskPixels = this.maskContext.createImageData(mask.width, mask.height)
    }
    const values = mask.getAsFloat32Array()
    if (!writePersonMask(values, this.maskPixels.data, dedicated)) return false
    this.maskContext.putImageData(this.maskPixels, 0, 0)
    return true
  }

  private consume(result: HolisticLandmarkerResult, now: number) {
    const face = result.faceLandmarks[0] ?? []
    const pose = result.poseLandmarks[0] ?? []
    const preciseFrame = getCostumeFrame(face, pose)
    const frame = preciseFrame ?? getPoseCostumeFrame(pose)
    if (frame) {
      this.faceFrame = frame
      this.lastFace = now
    }
    const trackedFace = frame ?? (now - this.lastFace < 900 ? this.faceFrame : null)
    const hands = [result.leftHandLandmarks[0] ?? [], result.rightHandLandmarks[0] ?? []]
    this.costumeHands = hands.map(hand => hand.map(p => ({ x: p.x, y: p.y, z: p.z })))
    const handBelowLips = trackedFace && isHandBelowLips(trackedFace, hands, pose)
    this.faceHold.update(!!handBelowLips, now)
    const hasHand = hands.some(hand => hand.length > 0)
      || [15, 16, 17, 18, 19, 20, 21, 22].some(index =>
        !!pose[index] && Number.isFinite(pose[index].x) && Number.isFinite(pose[index].y)
        && (pose[index].visibility ?? 1) >= .2)
    this.setTrackingState(!trackedFace ? 'face-missing'
      : handBelowLips ? 'hand-near' : hasHand ? 'hand-away' : 'hand-missing')
    if (!result.poseLandmarks[0]?.length) {
      this.lastMask = -Infinity
      this.invalidMasks = 0
      this.hold.reset()
      this.prayerHold.reset()
      return
    }
    if (!this.segmenter) {
      const mask = result.poseSegmentationMasks[0]
      if (!mask || !this.updateMask(mask)) {
        this.lastMask = -Infinity
        this.invalidMasks++
        this.hold.reset()
        this.prayerHold.reset()
        return
      }
      this.invalidMasks = 0
      this.lastMask = now
    }
    const aspect = this.input.width / this.input.height
    const prayer = isPrayerPose(result.leftHandLandmarks[0] ?? [], result.rightHandLandmarks[0] ?? [],
      result.faceLandmarks[0] ?? [], result.poseLandmarks[0] ?? [], aspect)
    this.prayerHold.update(prayer, now)
    const detected = isConanPose(result.leftHandLandmarks[0] ?? [], result.leftHandWorldLandmarks[0], aspect)
      || isConanPose(result.rightHandLandmarks[0] ?? [], result.rightHandWorldLandmarks[0], aspect)
    const wasActive = this.hold.active
    if (this.prayerHold.active) this.hold.reset()
    else if (this.hold.update(detected, now) && !wasActive) this.activeSince = now
    if (this.prayerHold.active || this.cloneAmount > 0) updateCloneSource(this.cloneSourceContext, this.snapshot)
  }

  private render = (now: number) => {
    if (!this.running || !this.tracker || document.hidden) return
    const dt = this.previousFrame ? Math.min((now - this.previousFrame) / 1000, .1) : 0
    this.previousFrame = now
    const video = this.video
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight
      && video.currentTime !== this.lastVideoTime && now - this.lastDetection >= this.interval) {
      this.lastDetection = now
      this.lastVideoTime = video.currentTime
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      const width = Math.round(video.videoWidth * scale)
      const height = Math.round(video.videoHeight * scale)
      if (this.input.width !== width || this.input.height !== height) {
        this.input.width = width
        this.input.height = height
        this.lastMask = -Infinity
      }
      try {
        // The foreground and its mask must describe exactly the same camera frame.
        const snapshotScale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
        const snapshotWidth = Math.round(video.videoWidth * snapshotScale)
        const snapshotHeight = Math.round(video.videoHeight * snapshotScale)
        if (this.snapshot.width !== snapshotWidth || this.snapshot.height !== snapshotHeight) {
          this.snapshot.width = snapshotWidth
          this.snapshot.height = snapshotHeight
        }
        this.snapshotContext.drawImage(video, 0, 0, snapshotWidth, snapshotHeight)
        this.inputContext.drawImage(this.snapshot, 0, 0, width, height)
        const before = performance.now()
        this.tracker.detectForVideo(this.input, now, result => this.consume(result, now))
        if (this.segmenter) {
          try {
            const segmentScale = Math.min(1, 960 / Math.max(snapshotWidth, snapshotHeight))
            const segmentWidth = Math.round(snapshotWidth * segmentScale)
            const segmentHeight = Math.round(snapshotHeight * segmentScale)
            if (this.segmentInput.width !== segmentWidth || this.segmentInput.height !== segmentHeight) {
              this.segmentInput.width = segmentWidth
              this.segmentInput.height = segmentHeight
            }
            this.segmentInputContext.drawImage(this.snapshot, 0, 0, segmentWidth, segmentHeight)
            this.segmenter.segmentForVideo(this.segmentInput, now, result => {
              const person = result.confidenceMasks?.[0]
              if (person && this.updateMask(person, true)) {
                this.lastMask = now
                this.segmentFailures = 0
              } else {
                this.lastMask = -Infinity
                this.hold.reset()
                this.prayerHold.reset()
                if (++this.segmentFailures >= 3) {
                  this.segmenter?.close()
                  this.segmenter = null
                }
              }
            })
          } catch (error) {
            console.warn('Dedicated person segmentation stopped; using pose mask', error)
            this.segmenter.close()
            this.segmenter = null
          }
        }
        // Leave time for video playback and touch input on slower mobile CPUs.
        this.interval = Math.max(1000 / 15, (performance.now() - before) * 1.6)
        this.failures = 0
      } catch (error) {
        this.lastMask = -Infinity
        this.hold.reset()
        this.prayerHold.reset()
        if (++this.failures >= 3) {
          console.warn('Conan tracking stopped', error)
          this.stop()
          this.tracker.close()
          this.tracker = null
          this.setState('error')
          return
        }
      }
    }

    // Some GPU drivers return all-zero masks despite valid body landmarks.
    // Keep the camera visible and retry segmentation with CPU once.
    if (this.invalidMasks >= 3 && !this.preferCPU) {
      this.stop()
      this.tracker.close()
      this.tracker = null
      this.preferCPU = true
      void this.start()
      return
    }

    const hasMask = now - this.lastMask < Math.max(350, this.interval * 2)
    if (!hasMask) {
      this.hold.reset()
      this.prayerHold.reset()
    }
    const active = hasMask && this.hold.active
    const cloning = hasMask && this.prayerHold.active
    const hasFace = now - this.lastFace < Math.max(900, this.interval * 3)
    if (!hasFace) this.faceHold.reset()
    const costumed = hasFace && this.faceHold.active
    this.setState(cloning ? 'cloning' : active ? 'active' : costumed ? 'costume' : 'ready')
    this.opacity = Math.max(0, Math.min(1, this.opacity + (active ? dt / .9 : -dt / .65)))
    const showBeam = active && now - this.activeSince > 250
    this.beam = Math.max(0, Math.min(1, this.beam + (showBeam ? dt / 1.6 : -dt / .55)))
    this.cloneAmount = Math.max(0, Math.min(1, this.cloneAmount + (cloning ? dt / .65 : -dt / .55)))
    this.costumeAmount = Math.max(0, Math.min(1, this.costumeAmount + (costumed ? dt / .35 : -dt / .42)))

    if (hasMask && (this.opacity > 0 || this.cloneAmount > 0)) {
      const bounds = this.canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 2048 / Math.max(bounds.width, bounds.height))
      const width = Math.max(1, Math.round(bounds.width * ratio))
      const height = Math.max(1, Math.round(bounds.height * ratio))
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width
        this.canvas.height = height
        this.foreground.width = width
        this.foreground.height = height
        this.cloneLayer.width = width
        this.cloneLayer.height = height
      }
      composeCameraScene(this.context, this.foregroundContext, this.snapshot, this.mask,
        width, height, this.beam, this.opacity, video.classList.contains('mirrored'),
        { source: this.cloneSource, context: this.cloneContext, amount: this.cloneAmount })
      this.canvas.style.opacity = '1'
    } else {
      this.canvas.style.opacity = '0'
      if (!hasMask) this.opacity = this.beam = this.cloneAmount = 0
    }
    if (hasFace && this.faceFrame && this.costumeAmount > 0) {
      const bounds = this.costumeCanvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2, 2048 / Math.max(bounds.width, bounds.height))
      const width = Math.max(1, Math.round(bounds.width * ratio))
      const height = Math.max(1, Math.round(bounds.height * ratio))
      if (this.costumeCanvas.width !== width || this.costumeCanvas.height !== height) {
        this.costumeCanvas.width = width
        this.costumeCanvas.height = height
      }
      this.costumeContext.clearRect(0, 0, width, height)
      drawCostume(this.costumeContext, this.faceFrame, width, height,
        this.snapshot.width, this.snapshot.height, video.classList.contains('mirrored'))
      revealTrackedHands(this.costumeContext, this.costumeHands, width, height,
        this.snapshot.width, this.snapshot.height, video.classList.contains('mirrored'))
      const fade = this.costumeAmount
      this.costumeCanvas.style.opacity = String(fade * fade * (3 - 2 * fade))
    } else {
      this.costumeCanvas.style.opacity = '0'
      if (!hasFace) this.costumeAmount = 0
    }
    this.frame = requestAnimationFrame(this.render)
  }
}
