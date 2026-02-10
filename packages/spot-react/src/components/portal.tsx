import { ReactNode, useState, useRef, useLayoutEffect } from "react"
import { createPortal } from "react-dom"

export const Portal = ({
    children,
    container,
  }: {
    children: ReactNode
    container?: Element | DocumentFragment | null
  }) => {
    const [mounted, setMounted] = useState(false)
  
    // Keep a stable container for the lifetime of this Portal instance
    const resolvedContainerRef = useRef<Element | DocumentFragment | null>(null)
  
    useLayoutEffect(() => {
      setMounted(true)
  
      // Resolve ONCE on mount to avoid container changes causing removeChild issues
      resolvedContainerRef.current = container ?? document.body
  
      return () => {
        // On unmount, clear ref (not strictly required, but keeps things clean)
        resolvedContainerRef.current = null
      }
      // Intentionally empty deps: we DO NOT want to re-resolve if `container` prop changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  
    if (typeof document === 'undefined') return null // SSR safe
    if (!mounted) return null
  
    const target = resolvedContainerRef.current
    if (!target) return null
  
    return createPortal(children, target)
  }
  