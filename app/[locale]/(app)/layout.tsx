import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'
import SessionProvider from '@/components/layout/SessionProvider'
import AIChatWidget from '@/components/ai/AIChatWidget'

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await auth()

  if (!session) redirect(`/${locale}/login`)

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
      <AIChatWidget />
    </SessionProvider>
  )
}
