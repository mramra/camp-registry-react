import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-bg">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[200]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* المحتوى */}
      <main className="px-4 pt-4 pb-24 max-w-3xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
