import { isAdmin } from '@/lib/session'
import AdminLogin from './AdminLogin'
import AdminConsole from './AdminConsole'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Console — Donivers' }

export default async function AdminPage() {
  return (await isAdmin()) ? <AdminConsole /> : <AdminLogin />
}
