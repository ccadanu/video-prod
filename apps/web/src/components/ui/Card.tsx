import type { HTMLAttributes } from 'react';
import { cx } from './cx';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-[14px] border border-line bg-white shadow-card', className)} {...p} />;
}
