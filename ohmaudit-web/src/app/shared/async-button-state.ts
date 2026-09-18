export function asyncButtonResultState(error: string): 'success' | 'error' {
  return error.trim() === '' ? 'success' : 'error';
}
