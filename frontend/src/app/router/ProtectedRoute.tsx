import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/store/session/session.store'

type ProtectedRouteProps = {
  canAccess: boolean
  redirectTo: string
}

export function ProtectedRoute({ canAccess, redirectTo }: ProtectedRouteProps) {
  const hydrated = useSessionStore((state) => state.hydrated)
  const location = useLocation()

  if (!hydrated) {
    return null
  }

  if (!canAccess) {
    return <Navigate replace state={{ from: location }} to={redirectTo} />
  }

  return <Outlet />
}
