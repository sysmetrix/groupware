import {AppError} from './schema.mjs';

export class AutomationError extends AppError {
  constructor(code, message, status = 400) { super(message, status); this.code = code; }
}
export function classifyFailure(error) {
  const known = {
    SCOPE_MISMATCH: ['사용자·조직 설정과 내보내기 범위를 확인하세요.', false],
    SOURCE_KIND: ['manual-export 형식의 실제 내보내기 자료를 준비하세요.', false],
    STALE_SOURCE: ['최신 자료를 다시 내보내세요.', false],
    SOURCE_ROLLBACK: ['현재 자료보다 새로운 내보내기 파일을 지정하세요.', false],
    SNAPSHOT_CHANGED: ['다음 자료 확인에서 다시 검증합니다.', true],
  };
  if (error instanceof AutomationError && Object.hasOwn(known, error.code)) {
    const [recoveryAction, retryable] = known[error.code];
    return {errorCode: error.code, message: error.message, recoveryAction, retryable};
  }
  if (error instanceof AppError) return {errorCode: 'INVALID_INPUT', message: error.message, recoveryAction: 'JSON 형식·필수 필드·자료 크기를 수정하세요.', retryable: false};
  if (error?.code === 'ENOENT') return {errorCode: 'INPUT_MISSING', message: '내보내기 파일을 기다리고 있습니다.', recoveryAction: '설정된 경로에 자료를 준비하세요.', retryable: false};
  if (['EBUSY', 'EAGAIN', 'EMFILE', 'ENFILE', 'ETIMEDOUT', 'EIO'].includes(error?.code)) return {errorCode: 'IO_TEMPORARY', message: '일시적인 파일 처리 오류입니다.', recoveryAction: '확인 간격을 늘려 다시 확인합니다.', retryable: true};
  if (['EACCES', 'EPERM', 'ENOSPC', 'EROFS'].includes(error?.code)) return {errorCode: 'STORAGE_UNAVAILABLE', message: '파일 접근 권한 또는 저장 공간을 확인하세요.', recoveryAction: '자료 폴더의 권한과 여유 공간을 수정하세요.', retryable: false};
  return {errorCode: 'PROCESSING_FAILED', message: '자료 처리에 실패했습니다.', recoveryAction: '자료 파일과 실행 환경을 확인하세요.', retryable: false};
}
export function nextDelaySeconds(base, failures, retryable) {
  if (!retryable || failures < 1) return base;
  return Math.min(Math.max(base, 900), base * 2 ** Math.min(failures, 10));
}
