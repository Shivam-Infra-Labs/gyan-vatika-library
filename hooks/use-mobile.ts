import * as React from "react"

const MOBILE_BREAKPOINT = 768

const subscribeMobile = (cb: () => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

const getIsMobileSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT
const getIsMobileServerSnapshot = () => false

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeMobile,
    getIsMobileSnapshot,
    getIsMobileServerSnapshot
  )
}
