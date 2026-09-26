export type EmployeeRole = 'cashier' | 'kitchen' | 'admin'

// The signed-in staff member, loaded fresh from the database on every request
export type StaffPrincipal = {
  id: number
  username: string
  fullName: string
  role: EmployeeRole
  sessionId: string
}
