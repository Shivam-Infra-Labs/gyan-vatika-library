'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/src/components/theme-provider';

interface PublicNavbarProps {
  onBookSeat: () => void;
}

export function PublicNavbar({ onBookSeat }: PublicNavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex justify-center px-4 pt-3 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center justify-between gap-4 md:gap-8 w-full transition-all duration-200 border backdrop-blur-md ${
          scrolled
            ? 'max-w-5xl rounded-2xl px-4 py-2 bg-white/90 dark:bg-[#18181B]/90 border-zinc-200 dark:border-zinc-800 shadow-lg shadow-black/5 dark:shadow-black/40'
            : 'max-w-7xl rounded-2xl px-5 py-3 bg-white/80 dark:bg-[#09090B]/80 border-zinc-200/80 dark:border-zinc-800/80'
        }`}
      >
        <Link
          href="/"
          className="font-display text-base md:text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0"
        >
          Gyan Vatika
        </Link>

        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400"
        >
          <a
            href="#tour"
            className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            Tour
          </a>
          <a
            href="#seats"
            className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            Seat Map
          </a>
          <a
            href="#plans"
            className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            Plans
          </a>
          <a
            href="#gallery"
            className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            Gallery
          </a>
          <Link
            href="/admission"
            className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            Admission
          </Link>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            href="/student"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs md:text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
          >
            Student Login
          </Link>

          <button
            type="button"
            onClick={onBookSeat}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 px-3.5 py-2 text-xs md:text-sm font-semibold text-white dark:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
          >
            Book a Seat
          </button>
        </div>
      </div>
    </header>
  );
}
