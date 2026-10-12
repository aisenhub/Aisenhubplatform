import type { StatusTone } from '@kit/ui/status-badge';

export type FeedbackListItem = {
  feedback_id: string;
  platform_account_id: string | null;
  user_id: string | null;
  author_display_name: string;
  contact_allowed: boolean;
  category: string;
  title: string | null;
  body_summary: string | null;
  status: string;
  flagged: boolean;
  labels: string[];
  attachment_count: number;
  row_version: number;
  submitted_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackAttachment = {
  attachment_id: string;
  original_name: string;
  mime_type: string;
  actual_size_bytes: number | null;
  status: string;
  write_outcome: string;
  created_at: string;
  content_path: string | null;
};

export type FeedbackTimelineEvent = {
  event_id: string;
  event_type: string;
  actor_user_id: string | null;
  note_body: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FeedbackDetail = FeedbackListItem & {
  platform_id: string;
  contact_email: string | null;
  body: string | null;
  client_context: Record<string, unknown>;
  attachments: FeedbackAttachment[];
  timeline: FeedbackTimelineEvent[];
  delete_requested_at: string | null;
};

export const FEEDBACK_STATUSES = [
  'new',
  'reviewing',
  'planned',
  'resolved',
  'closed',
  'deleting',
] as const;

export const FEEDBACK_CATEGORIES = [
  'bug',
  'idea',
  'experience',
  'other',
] as const;

export function feedbackStatusView(value: string): {
  label: string;
  tone: StatusTone;
} {
  switch (value) {
    case 'new':
      return { label: '新反馈', tone: 'warning' };
    case 'reviewing':
      return { label: '处理中', tone: 'warning' };
    case 'planned':
      return { label: '已规划', tone: 'neutral' };
    case 'resolved':
      return { label: '已解决', tone: 'success' };
    case 'closed':
      return { label: '已关闭', tone: 'neutral' };
    case 'deleting':
      return { label: '删除处理中', tone: 'danger' };
    default:
      return { label: value || '未记录', tone: 'unknown' };
  }
}

export function feedbackCategoryLabel(value: string): string {
  switch (value) {
    case 'bug':
      return '问题';
    case 'idea':
      return '建议';
    case 'experience':
      return '体验';
    case 'other':
      return '其他';
    default:
      return value || '未分类';
  }
}

export function feedbackSummary(item: FeedbackListItem): string {
  return item.title?.trim() || item.body_summary?.trim() || '无文字摘要';
}

export function feedbackImagePath(contentPath: string): string {
  return `/api/v1${contentPath.startsWith('/') ? contentPath : `/${contentPath}`}`;
}
