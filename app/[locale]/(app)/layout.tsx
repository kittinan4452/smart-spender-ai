import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import BottomNav from '@/components/layout/BottomNav'
import MobileHeader from '@/components/layout/MobileHeader'
import SessionProvider from '@/components/layout/SessionProvider'
import AIChatWidget from '@/components/ai/AIChatWidget'
import SlipUploadFAB from '@/components/transactions/SlipUploadFAB'

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
          <MobileHeader />
          {children}
        </main>
      </div>
      <BottomNav />
      <SlipUploadFAB />
      <AIChatWidget />
    </SessionProvider>
  )
}
