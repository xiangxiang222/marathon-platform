// Club logos share the image formats and bounded canvas decoding used by profile avatars.
export function clubLogoUrl(value) {
  const raw = String(value || '').trim();
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/marathon\/api\/club-logos\/\d+\/[^/?#]+$/.test(url.pathname) || url.search || url.hash) return '';
    return url.href;
  } catch { return ''; }
}
export function prepareClubLogo(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.reject(new Error('请选择 JPG、PNG 或 WebP 图片'));
  if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error('图片过大，请选择 20 MB 以内的图片'));
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file), image = new Image();
    const release = () => URL.revokeObjectURL(source);
    image.onerror = () => { release(); reject(new Error('无法读取这张图片，请重新选择')); };
    image.onload = () => {
      try {
        const scale = Math.min(1, 480 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('图片处理暂不可用，请重新选择');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let result = canvas.toDataURL('image/png');
        if (result.length > 349000) {
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
          for (let quality = .85; quality >= .35; quality -= .1) { result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 349000) break; }
        }
        if (result.length > 349000) throw new Error('图片压缩后仍然过大，请换一张 Logo');
        release(); resolve(result);
      } catch (error) { release(); reject(error); }
    };
    image.src = source;
  });
}
