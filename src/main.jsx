import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// مسح الـ Service Worker القديم وإجبار التحديث
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    // إلغاء تسجيل SW القديمة
    regs.forEach(reg => {
      reg.update()
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
