'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import Swal from 'sweetalert2'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
  transactionCount: number
  lastActive: string | null
}

interface Stats {
  totalUsers: number
  newThisMonth: number
  activeToday: number
  activeLast30: number
  totalTransactions: number
  transactionsThisMonth: number
  users: UserRow[]
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const locale = params.locale as string
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)

  async function loadStats(signal?: AbortSignal) {
    try {
      const d = await fetch('/api/admin/stats', { signal }).then(r => r.ok ? r.json() : null)
      if (d) setStats(d)
      setLoading(false)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error(e)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (!session || session.user.role !== 'admin') {
      router.replace(`/${locale}/dashboard`)
      return
    }
    const ac = new AbortController()
    loadStats(ac.signal)
    return () => ac.abort()
  }, [session, status])

  async function handleRoleChange(userId: string, userName: string | null, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'member' : 'admin'
    const label = newRole === 'admin' ? 'Admin' : 'Member'

    const result = await Swal.fire({
      title: `เปลี่ยนเป็น ${label}?`,
      text: `"${userName || userId}" จะถูกเปลี่ยน role เป็น ${label}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `ยืนยัน`,
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#6366f1',
      cancelButtonColor: '#6b7280',
    })

    if (!result.isConfirmed) return

    setChangingRole(userId)
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })

    if (res.ok) {
      toast.success(`เปลี่ยน "${userName}" เป็น ${label} แล้ว`)
      await loadStats()
    } else {
      const data = await res.json()
      toast.error(data.error || 'เกิดข้อผิดพลาด')
    }
    setChangingRole(null)
  }

  async function handleDelete(userId: string, userName: string | null) {
    const result = await Swal.fire({
      title: 'ลบผู้ใช้?',
      html: `<p>ลบ <b>${userName || userId}</b> และรายการทั้งหมดของเขา</p><p class="text-sm text-gray-500 mt-1">ไม่สามารถกู้คืนได้</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบเลย',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
    })

    if (!result.isConfirmed) return

    setDeleting(userId)
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })

    if (res.ok) {
      toast.success(`ลบ "${userName}" แล้ว`)
      await loadStats()
    } else {
      const data = await res.json()
      toast.error(data.error || 'เกิดข้อผิดพลาด')
    }
    setDeleting(null)
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-400 dark:text-gray-500">กำลังโหลด...</div>
  }

  if (!stats) return null

  const statCards = [
    { label: 'ผู้ใช้ทั้งหมด', value: stats.totalUsers, icon: '👥', color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'สมัครเดือนนี้', value: stats.newThisMonth, icon: '🆕', color: 'text-green-600 dark:text-green-400' },
    { label: 'ใช้งานวันนี้', value: stats.activeToday, icon: '🟢', color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'ใช้งาน 30 วัน', value: stats.activeLast30, icon: '📅', color: 'text-blue-600 dark:text-blue-400' },
    { label: 'รายการทั้งหมด', value: stats.totalTransactions, icon: '💳', color: 'text-purple-600 dark:text-purple-400' },
    { label: 'รายการเดือนนี้', value: stats.transactionsThisMonth, icon: '📊', color: 'text-orange-600 dark:text-orange-400' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">🛡️ Admin Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ภาพรวมการใช้งานระบบ</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        {statCards.map((card, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="text-xl md:text-2xl">{card.icon}</span>
              <div>
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`text-xl md:text-2xl font-bold ${card.color}`}>{card.value.toLocaleString()}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Users — Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">รายชื่อผู้ใช้</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ผู้ใช้</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">สมัครเมื่อ</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase text-center">รายการ</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ใช้งานล่าสุด</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stats.users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">{user.name || '-'}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                    {format(new Date(user.createdAt), 'd MMM yyyy', { locale: th })}
                  </td>
                  <td className="px-5 py-4 text-center font-semibold text-gray-800 dark:text-gray-200">
                    {user.transactionCount}
                  </td>
                  <td className="px-5 py-4">
                    {user.lastActive ? (
                      <div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {format(new Date(user.lastActive), 'd MMM yyyy HH:mm', { locale: th })}
                        </p>
                        <ActiveBadge lastActive={user.lastActive} />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">ยังไม่มีรายการ</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {user.id !== session?.user?.id && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRoleChange(user.id, user.name, user.role)}
                          disabled={changingRole === user.id}
                          className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 whitespace-nowrap transition-colors"
                        >
                          {changingRole === user.id ? '...' : user.role === 'admin' ? '↓ member' : '↑ admin'}
                        </button>
                        {user.role !== 'admin' && (
                          <button
                            onClick={() => handleDelete(user.id, user.name)}
                            disabled={deleting === user.id}
                            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-40 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                          >
                            {deleting === user.id ? '...' : 'ลบ'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users — Mobile Cards */}
      <div className="md:hidden space-y-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">รายชื่อผู้ใช้</h2>
        {stats.users.map(user => (
          <div key={user.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">{user.name || '-'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
              </div>
              <RoleBadge role={user.role} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
              <div>
                <span className="text-gray-400">สมัคร:</span> {format(new Date(user.createdAt), 'd MMM yyyy', { locale: th })}
              </div>
              <div>
                <span className="text-gray-400">รายการ:</span> {user.transactionCount} รายการ
              </div>
              <div className="col-span-2">
                <span className="text-gray-400">ล่าสุด:</span>{' '}
                {user.lastActive
                  ? <><ActiveBadge lastActive={user.lastActive} /></>
                  : 'ยังไม่มีรายการ'}
              </div>
            </div>
            {user.id !== session?.user?.id && (
              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => handleRoleChange(user.id, user.name, user.role)}
                  disabled={changingRole === user.id}
                  className="flex-1 text-xs text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-40 transition-colors"
                >
                  {changingRole === user.id ? '...' : user.role === 'admin' ? '↓ ลด member' : '↑ เลื่อน admin'}
                </button>
                {user.role !== 'admin' && (
                  <button
                    onClick={() => handleDelete(user.id, user.name)}
                    disabled={deleting === user.id}
                    className="flex-1 text-xs text-red-500 border border-red-200 dark:border-red-900 rounded-xl py-2 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
                  >
                    {deleting === user.id ? '...' : 'ลบผู้ใช้'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      role === 'admin'
        ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }`}>
      {role === 'admin' ? '🛡️ admin' : '👤 member'}
    </span>
  )
}

function ActiveBadge({ lastActive }: { lastActive: string }) {
  const diff = Date.now() - new Date(lastActive).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">● วันนี้</span>
  if (days <= 7) return <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">● {days} วันที่แล้ว</span>
  if (days <= 30) return <span className="text-xs text-yellow-500 dark:text-yellow-400 font-medium">● {days} วันที่แล้ว</span>
  return <span className="text-xs text-gray-400 dark:text-gray-500">● {days} วันที่แล้ว</span>
}
