export type DataScope =
  | { type: 'ALL' }
  | { type: 'DEPARTMENT'; departmentIds: string[] }
  | { type: 'PROJECT'; projectIds: string[] }
  | { type: 'SELF'; userId: string }
  | { type: 'OWNER'; userId: string }
  | { type: 'CREATOR'; userId: string }
  | { type: 'PARTICIPANT'; userId: string }

export interface SessionUser {
  id: string
  cloudbaseUid: string
  employeeId: string
  departmentId: string
  enabled: boolean
  roleCodes: string[]
  permissionCodes: string[]
  dataScopes: DataScope[]
}

export interface ApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
  }
  requestId: string
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type LeadStatus =
  | 'DRAFT'
  | 'PENDING_REGISTRATION'
  | 'RETURNED'
  | 'REJECTED'
  | 'FOLLOWING'
  | 'CONVERTED'
  | 'INVALID'

export interface CounterpartySummary {
  id: string
  code: string
  name: string
  shortName: string | null
  type: string
  cooperationStatus: string
}

export interface LeadSummary {
  id: string
  code: string
  projectName: string
  customerId: string
  ownerId: string
  successProbability: number
  status: LeadStatus
  nextFollowUpAt: string | null
}
