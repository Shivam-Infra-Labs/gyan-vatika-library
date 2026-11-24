'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { HelpCircle, Loader2, Send, X } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export type AssistantMode = 'PUBLIC' | 'STUDENT' | 'ADMIN';

const PROMPTS_BY_MODE: Record<AssistantMode, string[]> = {
  PUBLIC: [
    'How many seats are open today?',
    'What are the shift fees & flexible slots?',
    'How do I apply for admission?',
    'Address & library timings',
  ],
  STUDENT: [
    'My desk, shift & membership expiry',
    'Do I have any pending fees?',
    'My issued books & due dates',
    'How many seats are open today?',
  ],
  ADMIN: [
    'Who is checked in right now?',
    'Monthly revenue & pending dues',
    'Pending admissions, waitlist & tickets',
    'How many seats are open today?',
  ],
};

const GREETING_BY_MODE: Record<AssistantMode, { subtitle: string; welcome: string }> = {
  PUBLIC: {
    subtitle: 'Live seat & shift answers from center records',
    welcome:
      'Namaste! Ask me about live desk availability across our 50 seats, Morning/Evening/Full Day/Flexible 2–3 hr shifts & fees, admission KYC steps, or directions to Sunful Complex.',
  },
  STUDENT: {
    subtitle: 'Student Portal Assistant · Live Account & Library Info',
    welcome:
      'Namaste! Ask me about your assigned desk, shift timing, membership expiry, pending fee balance, borrowed books, or live library availability.',
  },
  ADMIN: {
    subtitle: 'Reception Staff Assistant · Live Operations Summary',
    welcome:
      'Staff Assistant ready. Ask me about students currently checked in, monthly fee collections & dues, pending online admissions, waitlist count, or open desk availability.',
  },
};

export function SmartAssistant({
  mode = 'PUBLIC',
  staffToken,
}: {
  mode?: AssistantMode;
  staffToken?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const idSeqRef = useRef(0);
  const meta = GREETING_BY_MODE[mode];
  const quickPrompts = PROMPTS_BY_MODE[mode];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: meta.welcome,
    },
  ]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;

    idSeqRef.current += 1;
    const userMsg: ChatMessage = { id: `u-${idSeqRef.current}`, role: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (mode === 'ADMIN' && staffToken) {
        headers.Authorization = `Bearer ${staffToken}`;
      }
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      idSeqRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${idSeqRef.current}`,
          role: 'assistant',
          text: json.answer || json.error || 'Please call reception at 08580103307 for immediate help.',
        },
      ]);
    } catch {
      idSeqRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${idSeqRef.current}`,
          role: 'assistant',
          text: 'Unable to reach reception database right now. Please call 08580103307.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Library Help Desk"
        className="fixed bottom-5 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-4 text-xs font-medium text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
      >
        {open ? <X className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
        <span>{open ? 'Close Desk' : mode === 'ADMIN' ? 'Staff Help' : 'Library Help'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Gyan Vatika Library Help Desk"
          className="fixed bottom-20 right-5 z-40 flex h-[480px] max-h-[75vh] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121215] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Gyan Vatika Help Desk
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {meta.subtitle}
              </p>
            </div>
            {mode === 'PUBLIC' && (
              <Link
                href="/admission"
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
              >
                Admission →
              </Link>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 px-3 py-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                  Checking live records...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 pt-2.5 pb-2">
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {quickPrompts.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  onClick={() => ask(qp)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === 'ADMIN'
                    ? 'Ask about check-ins, revenue, waitlist...'
                    : mode === 'STUDENT'
                    ? 'Ask about your desk, fees, books...'
                    : 'Ask about seats, fees, address...'
                }
                className="flex-1 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send question"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
