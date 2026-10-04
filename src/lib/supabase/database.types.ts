// =============================================================
// TypeScript types tự động sinh ra từ Supabase schema
// Dùng lệnh: pnpm supabase gen types --local > src/lib/supabase/database.types.ts
// Tạm thời định nghĩa thủ công để IDE không báo lỗi
// =============================================================

export type Role = 'admin' | 'truong_nha' | 'thu_quy' | 'member'
export type RoomType = 'bedroom' | 'common' | 'chapel' | 'kitchen' | 'storage' | 'laundry' | 'other'
export type RoomStatus = 'active' | 'maintenance' | 'reserved'
export type TxnType = 'income' | 'expense'
export type TxnStatus = 'pending' | 'approved' | 'rejected'
export type ContributionStatus = 'paid' | 'unpaid' | 'waived'
export type DutyStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type DutyShift = 'Ca Sáng (06:30)' | 'Ca Chiều (17:30)' | 'Ca Tối (21:00)'
export type EventCategory = 'Phụng vụ' | 'Họp nhà' | 'Bổn mạng' | 'Dã ngoại' | 'Sinh hoạt'
export type AttendanceStatus = 'present' | 'late' | 'absent'
export type AnnouncementCategory = 'Quan trọng' | 'Sự kiện' | 'Chung'
export type IssueStatus = 'new' | 'in_progress' | 'done'
export type ForumCategory = 'Đi chơi' | 'Bếp & Thực đơn' | 'Góp ý chung' | 'Học tập' | 'Giải trí'

// Expense categories (for chi)
export const EXPENSE_CATEGORIES = ['Thực phẩm', 'Điện nước', 'Vệ sinh', 'Sửa chữa', 'Phụng vụ', 'Khác'] as const
// Income categories (for thu)
export const INCOME_CATEGORIES = ['Quỹ tháng', 'Đóng góp', 'Khác'] as const

export type Tables = {
  rooms: {
    Row: {
      id: string
      name: string
      floor: number
      type: RoomType
      capacity: number
      amenities: string[]
      status: RoomStatus
      description: string | null
      area_m2: number | null
      pos_x: number | null
      pos_y: number | null
      pos_w: number | null
      pos_h: number | null
      created_at: string
    }
    Insert: Omit<Tables['rooms']['Row'], 'created_at'> & { created_at?: string }
    Update: Partial<Tables['rooms']['Insert']>
  }
  profiles: {
    Row: {
      id: string
      full_name: string
      nick_name: string | null
      holy_name: string | null
      phone: string | null
      role: Role
      room_id: string | null
      joined_date: string | null
      duty: string | null
      avatar_url: string | null
      is_active: boolean
      birth_date: string | null
      gender: 'Nam' | 'Nữ' | null
      id_card: string | null
      hometown: string | null
      home_address: string | null
      university: string | null
      major: string | null
      academic_year: string | null
      student_code: string | null
      diocese: string | null
      parish: string | null
      pastor: string | null
      sacraments: string[]
      parent_phone: string | null
      father_name: string | null
      mother_name: string | null
      created_at: string
      updated_at: string
    }
    Insert: Omit<Tables['profiles']['Row'], 'created_at' | 'updated_at' | 'sacraments'> & {
      sacraments?: string[]
      created_at?: string
      updated_at?: string
    }
    Update: Partial<Tables['profiles']['Insert']>
  }
  transactions: {
    Row: {
      id: string
      type: TxnType
      amount: number
      category: string
      description: string
      txn_date: string
      paid_by: string | null
      status: TxnStatus
      approved_by: string | null
      approved_at: string | null
      reject_reason: string | null
      note: string | null
      receipt_url: string | null
      created_by: string | null
      created_at: string
    }
    Insert: Omit<Tables['transactions']['Row'], 'id' | 'created_at' | 'approved_by' | 'approved_at'> & {
      id?: string
      created_at?: string
    }
    Update: Partial<Tables['transactions']['Insert']>
  }
  contributions: {
    Row: {
      id: string
      member_id: string
      period_label: string
      period_start: string
      period_end: string
      amount: number
      status: ContributionStatus
      paid_date: string | null
      waive_reason: string | null
      note: string | null
      updated_by: string | null
      updated_at: string
    }
    Insert: Omit<Tables['contributions']['Row'], 'id' | 'updated_at'> & { id?: string; updated_at?: string }
    Update: Partial<Tables['contributions']['Insert']>
  }
  cleaning_duties: {
    Row: {
      id: string
      date_assigned: string
      area: string
      area_icon: string
      shift: DutyShift
      assigned_room: string | null
      status: DutyStatus
      checked_in_by: string | null
      checked_in_at: string | null
      check_in_note: string | null
      evidence_url: string | null
      reviewed_by: string | null
      review_note: string | null
      reviewed_at: string | null
      created_by: string | null
      created_at: string
    }
    Insert: Omit<Tables['cleaning_duties']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
    Update: Partial<Tables['cleaning_duties']['Insert']>
  }
  duty_members: {
    Row: { duty_id: string; member_id: string }
    Insert: Tables['duty_members']['Row']
    Update: Tables['duty_members']['Row']
  }
  events: {
    Row: {
      id: string
      title: string
      category: EventCategory
      event_date: string
      time_start: string | null
      location: string | null
      organizer: string | null
      description: string | null
      has_checkin: boolean
      created_by: string | null
      created_at: string
    }
    Insert: Omit<Tables['events']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
    Update: Partial<Tables['events']['Insert']>
  }
  event_attendances: {
    Row: {
      event_id: string
      member_id: string
      status: AttendanceStatus
      note: string | null
      marked_by: string | null
      marked_at: string
    }
    Insert: Omit<Tables['event_attendances']['Row'], 'marked_at'> & { marked_at?: string }
    Update: Partial<Tables['event_attendances']['Insert']>
  }
  announcements: {
    Row: {
      id: string
      title: string
      content: string
      category: AnnouncementCategory
      is_pinned: boolean
      author_id: string | null
      file_url: string | null
      created_at: string
      updated_at: string
    }
    Insert: Omit<Tables['announcements']['Row'], 'id' | 'created_at' | 'updated_at'> & {
      id?: string; created_at?: string; updated_at?: string
    }
    Update: Partial<Tables['announcements']['Insert']>
  }
  announcement_reads: {
    Row: { announcement_id: string; member_id: string; read_at: string }
    Insert: Omit<Tables['announcement_reads']['Row'], 'read_at'> & { read_at?: string }
    Update: Tables['announcement_reads']['Insert']
  }
  maintenance_issues: {
    Row: {
      id: string
      title: string
      location: string
      description: string | null
      status: IssueStatus
      reported_by: string | null
      photo_url: string | null
      assignee: string | null
      cost: number | null
      resolved_at: string | null
      created_at: string
      updated_at: string
    }
    Insert: Omit<Tables['maintenance_issues']['Row'], 'id' | 'created_at' | 'updated_at'> & {
      id?: string; created_at?: string; updated_at?: string
    }
    Update: Partial<Tables['maintenance_issues']['Insert']>
  }
  forum_threads: {
    Row: {
      id: string
      title: string
      content: string
      category: ForumCategory
      author_id: string | null
      is_pinned: boolean
      created_at: string
    }
    Insert: Omit<Tables['forum_threads']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
    Update: Partial<Tables['forum_threads']['Insert']>
  }
  forum_replies: {
    Row: {
      id: string
      thread_id: string
      content: string
      author_id: string | null
      created_at: string
    }
    Insert: Omit<Tables['forum_replies']['Row'], 'id' | 'created_at'> & { id?: string; created_at?: string }
    Update: Partial<Tables['forum_replies']['Insert']>
  }
}

export type Database = {
  public: {
    Tables: Tables
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience type aliases
export type Room = Tables['rooms']['Row']
export type Profile = Tables['profiles']['Row']
export type Transaction = Tables['transactions']['Row']
export type Contribution = Tables['contributions']['Row']
export type CleaningDuty = Tables['cleaning_duties']['Row']
export type DutyMember = Tables['duty_members']['Row']
export type Event = Tables['events']['Row']
export type EventAttendance = Tables['event_attendances']['Row']
export type Announcement = Tables['announcements']['Row']
export type AnnouncementRead = Tables['announcement_reads']['Row']
export type MaintenanceIssue = Tables['maintenance_issues']['Row']
export type ForumThread = Tables['forum_threads']['Row']
export type ForumReply = Tables['forum_replies']['Row']
