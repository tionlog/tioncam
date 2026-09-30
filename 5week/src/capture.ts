import { getPortraitCrop } from './portrait'

export function captureOriginalFace(video: HTMLVideoElement, previewWidth: number, previewHeight: number, guideSize: number) {
  if (!video.videoWidth || !video.videoHeight || previewWidth <= 0 || previewHeight <= 0 || guideSize <= 0) {
    throw new Error('카메라가 준비되면 다시 촬영해 주세요.')
  }
  const crop = getPortraitCrop(video.videoWidth, video.videoHeight, previewWidth, previewHeight, guideSize, guideSize)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  // A square guide/crop preserves the original aspect ratio. Only resize/crop:
  // no horizontal mirroring, segmentation, warp, smoothing or recoloring.
  canvas.getContext('2d')!.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, 512, 512)
  return canvas
}
