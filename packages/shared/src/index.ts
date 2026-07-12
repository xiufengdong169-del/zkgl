export type DataScope =
  | { type: 'ALL' }
  | { type: 'DEPARTMENT'; departmentIds: string[] }
  | { type: 'PROJECT'; projectIds: string[] }
  | { type: 'SELF'; userId: string }

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
