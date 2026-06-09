import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, size='md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={`relative bg-surface border border-border rounded-2xl w-full ${sizes[size]} max-h-[90vh] overflow-y-auto shadow-2xl`}>
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-border">
            <h2 className="font-bold text-white text-base">{title}</h2>
            <button onClick={onClose} className="text-muted text-xl w-8 h-8 flex items-center justify-center">✕</button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
