'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  consumerAuthSession,
  type ConsumerSessionSnapshot,
  sessionErrorMessage,
} from '../app/_lib/auth-session';

export function ConsumerAuthActions() {
  const [snapshot, setSnapshot] = useState<ConsumerSessionSnapshot>(() =>
    consumerAuthSession.getSessionState(),
  );
  const [error, setError] = useState('');

  useEffect(() => consumerAuthSession.subscribe(setSnapshot), []);

  if (snapshot.state !== 'authenticated') {
    return (
      <Link className="consumer-small-button" href="/login">
        登录账户
      </Link>
    );
  }

  async function logout() {
    setError('正在退出…');
    try {
      const response = await consumerAuthSession.logout();
      if (!response.ok) {
        setError('退出失败，请稍后重试。');
        return;
      }
      setError('已退出');
    } catch (caught) {
      setError(sessionErrorMessage(caught));
    }
  }

  return (
    <div className="consumer-auth-actions">
      <button
        className="consumer-small-button"
        onClick={() => void logout()}
        type="button"
      >
        退出登录
      </button>
      {error ? <small role="status">{error}</small> : null}
    </div>
  );
}
