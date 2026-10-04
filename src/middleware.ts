import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Các route công khai không yêu cầu đăng nhập
const PUBLIC_ROUTES = ['/dang-nhap', '/cho-phe-duyet']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Nếu chưa cấu hình Supabase env, cho phép truy cập để không crash trang
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Lấy thông tin user hiện tại (an toàn với try-catch)
    const { data: { user } } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname
    const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))

    // Chưa đăng nhập + truy cập route bảo mật → chuyển hướng đến /dang-nhap
    if (!user && !isPublicRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/dang-nhap'
      return NextResponse.redirect(url)
    }

    // Đã đăng nhập + vào trang login → chuyển hướng về trang chủ /
    if (user && pathname === '/dang-nhap') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  } catch (error) {
    console.warn('[middleware] Error verifying session:', error)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match tất cả các route ngoại trừ static files, images, favicon
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
