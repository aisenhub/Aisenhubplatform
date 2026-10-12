import { describe, expect, it } from 'vitest';

import {
  feedbackCategoryLabel,
  feedbackImagePath,
  feedbackStatusView,
  feedbackSummary,
  type FeedbackListItem,
} from './feedback-model';

const item: FeedbackListItem = {
  feedback_id: '1',
  platform_account_id: null,
  user_id: null,
  author_display_name: 'User',
  contact_allowed: false,
  category: 'bug',
  title: 'Broken upload',
  body_summary: 'fallback',
  status: 'new',
  flagged: false,
  labels: [],
  attachment_count: 0,
  row_version: 1,
  submitted_at: null,
  resolved_at: null,
  created_at: '2026-10-12T00:00:00Z',
  updated_at: '2026-10-12T00:00:00Z',
};

describe('feedback model', () => {
  it('uses business labels for statuses and categories', () => {
    expect(feedbackStatusView('reviewing')).toEqual({
      label: '处理中',
      tone: 'warning',
    });
    expect(feedbackCategoryLabel('idea')).toBe('建议');
  });

  it('prefers a title and falls back to body summary', () => {
    expect(feedbackSummary(item)).toBe('Broken upload');
    expect(feedbackSummary({ ...item, title: null })).toBe('fallback');
  });

  it('routes private attachment paths through the Admin BFF', () => {
    expect(
      feedbackImagePath(
        '/admin/api/v1/platforms/p/feedback/f/attachments/a/content',
      ),
    ).toBe('/api/v1/admin/api/v1/platforms/p/feedback/f/attachments/a/content');
  });
});
