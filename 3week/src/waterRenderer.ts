export type WaterFinger = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  impact: number
}

type Ripple = { x: number; y: number; startedAt: number; strength: number }
type PreviousFinger = WaterFinger & { emittedAt: number }

const MAX_FINGERS = 10
const MAX_RIPPLES = 24
// The incoming camera is capped at 1280 × 720, so additional output pixels do
// not reveal detail; this cap avoids needlessly shading a 4K-sized surface.
const MAX_RENDER_PIXELS = 1_000_000

const vertexSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * .5 + .5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentSource = `
  precision mediump float;

  varying vec2 v_uv;
  uniform sampler2D u_camera;
  uniform vec4 u_crop;
  uniform vec4 u_fingers[${MAX_FINGERS}];
  uniform vec4 u_ripples[${MAX_RIPPLES}];
  uniform float u_time;

  vec2 safeNormalize(vec2 value) {
    float lengthValue = length(value);
    return lengthValue > .0001 ? value / lengthValue : vec2(0.0);
  }

  void main() {
    vec2 uv = v_uv;
    vec2 displacement = vec2(0.0);
    float shimmer = 0.0;

    for (int index = 0; index < ${MAX_FINGERS}; index++) {
      vec4 finger = u_fingers[index];
      if (finger.x < -1.0) continue;
      vec2 delta = uv - finger.xy;
      float distanceToFinger = length(delta);
      vec2 direction = safeNormalize(delta);
      float nearField = exp(-distanceToFinger * 17.0);
      float rings = sin(distanceToFinger * 86.0 - u_time * 8.0);
      displacement += direction * rings * nearField * .010;
      shimmer += nearField * .18;

      vec2 movement = finger.zw;
      float speed = length(movement);
      if (speed > .0001) {
        vec2 movementDirection = movement / speed;
        vec2 perpendicular = vec2(-movementDirection.y, movementDirection.x);
        float behindFinger = -dot(delta, movementDirection);
        float sideDistance = abs(dot(delta, perpendicular));
        float wake = step(0.0, behindFinger)
          * exp(-abs(sideDistance - behindFinger * .32) * 48.0)
          * exp(-behindFinger * 14.0)
          * min(speed * 13.0, 1.0);
        displacement += perpendicular * sign(dot(delta, perpendicular)) * wake * .014;
        shimmer += wake * .14;
      }
    }

    for (int index = 0; index < ${MAX_RIPPLES}; index++) {
      vec4 ripple = u_ripples[index];
      if (ripple.z < 0.0) continue;
      float age = u_time - ripple.z;
      if (age < 0.0 || age > 2.1) continue;
      vec2 delta = uv - ripple.xy;
      float distanceToRipple = length(delta);
      float radius = age * .19;
      float envelope = exp(-abs(distanceToRipple - radius) * 44.0) * exp(-age * 1.15) * ripple.w;
      vec2 direction = safeNormalize(delta);
      displacement += direction * sin((distanceToRipple - radius) * 86.0) * envelope * .018;
      shimmer += envelope * .18;
    }

    vec2 disturbed = clamp(uv + displacement, vec2(.001), vec2(.999));
    // u_crop uses bottom-origin coordinates. x is reversed for a familiar selfie view.
    vec2 cameraUv = vec2(
      u_crop.x + (1.0 - disturbed.x) * u_crop.z,
      u_crop.y + disturbed.y * u_crop.w
    );
    vec3 colour = texture2D(u_camera, cameraUv).rgb;
    colour += vec3(.025, .075, .095) * shimmer;
    gl_FragColor = vec4(colour, 1.0);
  }
`

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const value = gl.createShader(type)
  if (!value) throw new Error('Unable to create a WebGL shader.')
  gl.shaderSource(value, source)
  gl.compileShader(value)
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(value) || 'Unable to compile a WebGL shader.')
  }
  return value
}

export class WaterRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext | null
  private readonly program: WebGLProgram | null
  private readonly texture: WebGLTexture | null
  private readonly positions: WebGLBuffer | null
  private readonly locations: Record<string, WebGLUniformLocation | null> = {}
  private readonly previousFingers = new Map<string, PreviousFinger>()
  private readonly activeFingerIds = new Set<string>()
  private readonly ripples: Ripple[] = []
  private readonly activeFingers: WaterFinger[] = []
  private readonly fingerData = new Float32Array(MAX_FINGERS * 4)
  private readonly rippleData = new Float32Array(MAX_RIPPLES * 4)
  private sourceWidth = 0
  private sourceHeight = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
    })
    this.gl = gl
    if (!gl) {
      this.program = null
      this.texture = null
      this.positions = null
      return
    }

    try {
      const program = gl.createProgram()
      if (!program) throw new Error('Unable to create a WebGL program.')
      gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertexSource))
      gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragmentSource))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Unable to link WebGL program.')
      this.program = program
      this.texture = gl.createTexture()
      this.positions = gl.createBuffer()
      if (!this.texture || !this.positions) throw new Error('Unable to allocate WebGL resources.')

      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positions)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      ;['u_camera', 'u_crop', 'u_fingers', 'u_ripples', 'u_time'].forEach((name) => {
        const uniformName = name === 'u_fingers' || name === 'u_ripples' ? `${name}[0]` : name
        this.locations[name] = gl.getUniformLocation(program, uniformName)
      })
      gl.uniform1i(this.locations.u_camera, 0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    } catch {
      this.program = null
      this.texture = null
      this.positions = null
    }
  }

  get supported() {
    return Boolean(this.gl && this.program && this.texture && this.positions)
  }

  resize(width: number, height: number, pixelRatio: number) {
    const requestedWidth = Math.max(1, Math.round(width * pixelRatio))
    const requestedHeight = Math.max(1, Math.round(height * pixelRatio))
    const scale = Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (requestedWidth * requestedHeight)))
    const nextWidth = Math.max(1, Math.round(requestedWidth * scale))
    const nextHeight = Math.max(1, Math.round(requestedHeight * scale))
    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return
    this.canvas.width = nextWidth
    this.canvas.height = nextHeight
  }

  private updateRipples(fingers: WaterFinger[], now: number, width: number, height: number) {
    this.activeFingerIds.clear()
    for (let index = 0; index < fingers.length; index += 1) {
      const finger = fingers[index]
      this.activeFingerIds.add(finger.id)
      const previous = this.previousFingers.get(finger.id)
      const x = finger.x / width
      const y = 1 - finger.y / height
      const distanceMoved = previous ? Math.hypot(finger.x - previous.x, finger.y - previous.y) : Infinity
      const isFistImpact = finger.impact > 1
      const justMadeFist = previous && previous.impact <= 1 && isFistImpact
      const shouldEmit = !previous
        || justMadeFist
        || distanceMoved > (isFistImpact ? 5 : 9)
        || now - previous.emittedAt > (isFistImpact ? 82 : 220)
      if (shouldEmit) {
        const movementStrength = distanceMoved > 20 ? 1.25 : 1
        this.ripples.push({ x, y, startedAt: now / 1000, strength: movementStrength * finger.impact })
      }
      this.previousFingers.set(finger.id, {
        ...finger,
        emittedAt: shouldEmit || !previous ? now : previous.emittedAt,
      })
    }
    for (const id of this.previousFingers.keys()) {
      if (!this.activeFingerIds.has(id)) this.previousFingers.delete(id)
    }
    const oldestAllowed = now / 1000 - 2.1
    while (this.ripples.length && this.ripples[0].startedAt < oldestAllowed) this.ripples.shift()
    while (this.ripples.length > MAX_RIPPLES) this.ripples.shift()
  }

  render(video: HTMLVideoElement, crop: { sx: number; sy: number; sw: number; sh: number; videoWidth: number; videoHeight: number }, fingers: Iterable<WaterFinger>, now: number, width: number, height: number) {
    const gl = this.gl
    if (!gl || !this.program || !this.texture || !this.positions || video.readyState < 2) return false
    this.activeFingers.length = 0
    for (const finger of fingers) {
      if (this.activeFingers.length === MAX_FINGERS) break
      this.activeFingers.push(finger)
    }
    this.updateRipples(this.activeFingers, now, width, height)
    this.fingerData.fill(-2)
    for (let index = 0; index < this.activeFingers.length; index += 1) {
      const finger = this.activeFingers[index]
      this.fingerData[index * 4] = finger.x / width
      this.fingerData[index * 4 + 1] = 1 - finger.y / height
      this.fingerData[index * 4 + 2] = Math.max(-.11, Math.min(.11, finger.vx / width))
      this.fingerData[index * 4 + 3] = Math.max(-.11, Math.min(.11, -finger.vy / height))
    }
    this.rippleData.fill(-1)
    for (let index = 0; index < this.ripples.length; index += 1) {
      const ripple = this.ripples[index]
      this.rippleData[index * 4] = ripple.x
      this.rippleData[index * 4 + 1] = ripple.y
      this.rippleData[index * 4 + 2] = ripple.startedAt
      this.rippleData[index * 4 + 3] = ripple.strength
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    if (this.sourceWidth !== video.videoWidth || this.sourceHeight !== video.videoHeight) {
      this.sourceWidth = video.videoWidth
      this.sourceHeight = video.videoHeight
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)
    }
    gl.uniform4f(this.locations.u_crop, crop.sx / crop.videoWidth, (crop.videoHeight - crop.sy - crop.sh) / crop.videoHeight, crop.sw / crop.videoWidth, crop.sh / crop.videoHeight)
    gl.uniform4fv(this.locations.u_fingers, this.fingerData)
    gl.uniform4fv(this.locations.u_ripples, this.rippleData)
    gl.uniform1f(this.locations.u_time, now / 1000)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return true
  }
}
