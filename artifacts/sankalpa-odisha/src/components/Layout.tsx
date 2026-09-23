import type { ReactNode } from 'react';
import Header from './Header';
import PageNav from './PageNav';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <section className="main-body">
        <PageNav variant="top" />
        {children}
        <PageNav variant="bottom" />
      </section>
      <footer>
        &copy; 2025 Sankalpa Odisha - Government of Odisha. All rights reserved.
      </footer>
    </>
  );
}
