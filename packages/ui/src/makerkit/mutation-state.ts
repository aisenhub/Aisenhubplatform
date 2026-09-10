export type MutationState =
  | 'idle'
  | 'confirm_required'
  | 'step_up_required'
  | 'pending'
  | 'accepted'
  | 'success'
  | 'failure'
  | 'unknown_outcome';

export function mutationStateLabel(state: MutationState): string {
  switch (state) {
    case 'confirm_required':
      return '等待确认';
    case 'step_up_required':
      return '需要重新验证';
    case 'pending':
      return '处理中';
    case 'accepted':
      return '已受理';
    case 'success':
      return '已完成';
    case 'failure':
      return '未完成';
    case 'unknown_outcome':
      return '结果待确认';
    default:
      return '';
  }
}
