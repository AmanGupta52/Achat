/**
 * Center-crop an image file to a square and re-encode it as a small JPEG data URL,
 * so profile pictures stay tiny (typically 15–40 KB) whatever the original size.
 */
export const resizeToAvatar = async (file: File, size = 256): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image couldn't be read");
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images");

  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  // lower the quality until it's comfortably under the server's 200 KB limit
  for (const quality of [0.85, 0.7, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length * 0.75 < 150 * 1024) return url;
  }
  throw new Error("Image is too detailed — try a different one");
};
