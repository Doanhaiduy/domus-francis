/**
 * Upload helper — Supabase Storage (primary) + Cloudinary (fallback)
 * Dùng cho: ảnh hóa đơn (receipts), ảnh minh chứng trực nhật (evidence),
 *           ảnh báo hỏng (issues), avatar thành viên (avatars)
 */
import { createClient } from './client'

export type UploadBucket = 'receipts' | 'evidence' | 'avatars' | 'issues'

interface UploadResult {
  url: string
  provider: 'supabase' | 'cloudinary'
}

/**
 * Upload file ảnh lên Supabase Storage.
 * Nếu lỗi, tự động fallback sang Cloudinary (nếu đã cấu hình CLOUDINARY_UPLOAD_PRESET).
 */
export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  folder: string = ''
): Promise<UploadResult> {
  const supabase = createClient()

  // Tạo tên file unique: timestamp + random + extension gốc
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // ── Thử Supabase Storage trước ──────────────────────────────
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (!error && data) {
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    return { url: publicUrl, provider: 'supabase' }
  }

  console.warn('[upload] Supabase Storage lỗi, thử Cloudinary fallback:', error?.message)

  // ── Fallback Cloudinary ─────────────────────────────────────
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

  if (!uploadPreset || !cloudName) {
    throw new Error(`Upload thất bại: Supabase lỗi và chưa cấu hình Cloudinary. Chi tiết: ${error?.message}`)
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  formData.append('folder', `luu_xa/${bucket}/${folder}`)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!response.ok) {
    throw new Error(`Upload thất bại: Supabase và Cloudinary đều lỗi.`)
  }

  const result = await response.json()
  return { url: result.secure_url as string, provider: 'cloudinary' }
}

/**
 * Xóa ảnh theo URL (chỉ xóa được ảnh từ Supabase Storage)
 */
export async function deleteImage(
  url: string,
  bucket: UploadBucket
): Promise<void> {
  const supabase = createClient()

  // Trích đường dẫn từ public URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !url.includes(supabaseUrl)) return // Cloudinary URL, không xóa được

  const pathAfterBucket = url.split(`/storage/v1/object/public/${bucket}/`)[1]
  if (!pathAfterBucket) return

  await supabase.storage.from(bucket).remove([pathAfterBucket])
}
