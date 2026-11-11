import type { NativeImage } from 'electron';

/**
 * Encodes the captured frame as base64 PNG.
 *
 * PNG rather than JPEG because a model diagram has thin lines and small text;
 * lossy encoding would blur exactly the details a reviewing agent must read.
 */
export const imageToPng = (
  image: Pick<NativeImage, 'toPNG' | 'getSize'>,
): { data: string; width: number; height: number } => {
  const size = image.getSize();

  return {
    data: image.toPNG().toString('base64'),
    width: size.width,
    height: size.height,
  };
};
